import { underRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { isHex, type Hex } from 'viem';
import { executeAdmin, operationStatus } from '@/lib/sdk/operations';
import { snapshot } from '@/lib/sdk/snapshot';
import { prepare, verifyTransaction } from '@/lib/sdk/transactions';
import { address, object, parseAction, placement, SDKError } from '@/lib/sdk/validation';
import { readLimitedJsonBody, RequestBodyTooLargeError } from '@/lib/sdk/gardens/body';
import { cors, rateLimit } from '@/lib/sdk/http';
import { bridgeStatus } from '@/lib/sdk/bridge';
import { resolveClientChain } from '@/lib/sdk/chains';
import { publicDataProxyEnabled, recordPublicView } from '@/lib/sdk/presentation-data';
import * as activate from '@/lib/sdk/gardens/activate';
import * as claim from '@/lib/sdk/gardens/claim';
import * as quote from '@/lib/sdk/gardens/quote';
import * as community from '@/lib/sdk/gardens/community';
import * as views from '@/app/api/views/route';
import { checkoutEnabled, checkoutOrigin, createCheckout, checkoutRequest } from '@/lib/sdk/checkout';
import { verifySite } from '@/lib/sdk/site-verification';
import { SnapshotUnavailable } from '@/lib/sdk/snapshot-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function hash(value: unknown): Hex {
  if (typeof value !== 'string' || !isHex(value) || value.length !== 66) throw new SDKError('INVALID_HASH', 'Invalid transaction hash.');
  return value;
}
async function handle(request: NextRequest, context: { params: { path: string[] } }) {
  try {
    await rateLimit(request);
    const path = context.params.path.join('/');
    const search = request.nextUrl.searchParams;
    if (request.method === 'GET') {
      if (path === 'checkout/config') return cors(NextResponse.json({ enabled: checkoutEnabled() }), request);
      if (path.startsWith('operations/')) return cors(NextResponse.json(await operationStatus(path.slice(11))), request);
      if (path === 'snapshot') {
        const p = placement(JSON.parse(search.get('placement') || '{}'));
        const account = search.has('account') ? address(search.get('account')) : undefined;
        const offset = search.has('offset') ? Number(search.get('offset')) : undefined;
        if (offset !== undefined && (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000)) throw new SDKError('INVALID_OFFSET', 'Invalid page offset.');
        return cors(NextResponse.json(await snapshot(p, account, offset)), request);
      }
      if (path === 'community') return cors(await community.GET(request), request);
      if (path === 'community/quote') return cors(await quote.GET(request), request);
      if (path === 'community/status') {
        const protocol = search.get('protocol');
        if (!['none', 'squid', 'lifi', 'across'].includes(protocol || '')) throw new SDKError('INVALID_PROTOCOL', 'Unknown bridge protocol.');
        const from = Number(search.get('fromChainId')), to = Number(search.get('toChainId'));
        resolveClientChain(from); resolveClientChain(to);
        return cors(NextResponse.json(await bridgeStatus(protocol as 'none' | 'squid' | 'lifi' | 'across', hash(search.get('transactionHash')), from, to)), request);
      }
    }
    if (request.method === 'POST') {
      if (path === 'community/activate' || path === 'community/claim') {
        const body = object(await readLimitedJsonBody(request, 16 * 1024));
        const handler = path === 'community/activate' ? activate.POST : claim.POST;
        const rebuilt = new Request(request.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (body.action !== 'verify') return cors(await handler(rebuilt), request);
        if (typeof body.nonce !== 'string' || !/^[1-9][0-9]{0,77}$/.test(body.nonce) || typeof body.signature !== 'string' || !isHex(body.signature)) throw new SDKError('INVALID_AUTHORIZATION', 'Invalid authorization.');
        return cors(await executeAdmin(path, rebuilt, { nonce: body.nonce, signature: body.signature }, handler), request);
      }
      const body = object(await readLimitedJsonBody(request, 48 * 1024));
      if (path.startsWith('checkout/')) {
        if (!checkoutEnabled() && !['checkout/status', 'checkout/read', 'checkout/verify', 'checkout/submitted', 'checkout/conversion-verify'].includes(path)) throw new SDKError('NOT_CONFIGURED', 'Markee card checkout is not available yet.', 503);
        if (path === 'checkout/create') {
          const origin = checkoutOrigin(request.headers.get('origin') || body.origin);
          return cors(NextResponse.json(await createCheckout(body, origin)), request);
        }
        return cors(NextResponse.json(await checkoutRequest(path.slice(9), body)), request);
      }
      if (path === 'sites/verify') return cors(NextResponse.json(await verifySite(placement(body.placement), body.siteUrl, request.headers.get('origin'))), request);
      if (path === 'prepare') return cors(NextResponse.json(await prepare(placement(body.placement), address(body.account), parseAction(body.action))), request);
      if (path === 'verify') {
        if (typeof body.id !== 'string') throw new SDKError('INVALID_PREPARATION', 'A preparation ID is required.');
        return cors(NextResponse.json(await verifyTransaction(body.id, hash(body.hash))), request);
      }
      if (path === 'views') {
        const markee = address(body.address);
        if (typeof body.message !== 'string' || Buffer.byteLength(body.message) > 4096 || (body.url !== undefined && (typeof body.url !== 'string' || body.url.length > 2048))) throw new SDKError('INVALID_VIEW', 'Invalid view event.');
        if (publicDataProxyEnabled()) return cors(NextResponse.json(await recordPublicView({ address: markee, message: body.message, url: body.url as string | undefined })), request);
        return cors(await views.POST(new NextRequest(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify({ address: markee, message: body.message, url: body.url }) })), request);
      }
    }
    throw new SDKError('NOT_FOUND', 'Unknown SDK endpoint.', 404);
  } catch (error) {
    if (error instanceof SnapshotUnavailable) return cors(NextResponse.json({ error: error.message, code: 'SNAPSHOT_UNAVAILABLE' }, { status: 503, headers: { 'Retry-After': String(error.retryAfter) } }), request);
    const status = error instanceof SDKError ? error.status : error instanceof RequestBodyTooLargeError ? 413 : error instanceof SyntaxError ? 400 : 502;
    const operation = context.params.path.join('/');
    if (operation.startsWith('checkout/') && ((status >= 500 && !(error instanceof SDKError && error.code === 'NOT_CONFIGURED')) || (error instanceof SDKError && ['TRANSACTION_MISMATCH', 'TRANSACTION_REUSED', 'CONVERSION_FAILED'].includes(error.code)))) {
      // Bound retry alerts across serverless instances; never let diagnostics change the response.
      const knownOperations = ['config', 'create', 'status', 'read', 'verify', 'submitted', 'balance', 'prepare', 'arm', 'rejected', 'funding-start', 'funding-reset', 'conversion-quote', 'conversion-prepare', 'conversion-arm', 'conversion-rejected', 'conversion-verify'];
      const alertOperation = knownOperations.includes(operation.slice(9)) ? operation : 'checkout/unknown';
      try {
        if (await underRateLimit('checkout-alerts', `${process.env.VERCEL_ENV || 'local'}:${alertOperation}:${status}`, 3, 60)) {
          const { logger } = await import('@/lib/server/logger');
          await logger.error('Checkout API failure', { name: 'CheckoutError', message: error instanceof SDKError ? error.code : 'UPSTREAM_ERROR' }, { operation: alertOperation, status });
        }
      } catch {
        console.error('[sdk:v1] Checkout diagnostics unavailable', { operation: alertOperation, status });
      }
    } else if (status === 502) console.error('[sdk:v1]', error instanceof Error ? error.name : 'upstream error');
    const message = error instanceof SDKError ? error.message : status === 413 ? 'Request body is too large.' : status === 400 ? 'Invalid JSON request.' : 'Markee could not complete this request. Please retry.';
    return cors(NextResponse.json({ error: message, code: error instanceof SDKError ? error.code : 'REQUEST_FAILED' }, { status }), request);
  }
}
export const GET = handle;
export const POST = handle;
export function OPTIONS(request: NextRequest) { return cors(new NextResponse(null, { status: 204 }), request); }

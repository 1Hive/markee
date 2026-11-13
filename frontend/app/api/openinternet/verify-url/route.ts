// POST /api/openinternet/verify-url
//   { address, url, owner, signature, timestamp }
//   Markee's own verification UI. Only the board admin can attach a site: the signature covers
//   siteVerifyMessage(8453, address, url, timestamp) and is good for 5 minutes.
import { NextRequest, NextResponse } from 'next/server';
import { base } from 'viem/chains';
import { verifySite } from '@/lib/sdk/site-verification';
import { address, object, SDKError } from '@/lib/sdk/validation';
import { rateLimit } from '@/lib/sdk/http';
import { readLimitedJsonBody } from '@/lib/sdk/gardens/body';
import { boardAdminDenial } from '@/lib/boards/admin-auth';
import { siteVerifyMessage } from '@/lib/openinternet/verify-site';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  try {
    await rateLimit(req);
    const body = object(await readLimitedJsonBody(req, 4096));
    const board = address(body.address);
    if (typeof body.url !== 'string') throw new SDKError('INVALID_SITE', 'Provide a public HTTPS site URL.');
    const url = body.url;
    const denial = await boardAdminDenial(board, body, timestamp => siteVerifyMessage(base.id, board, url, timestamp), 'verify sites for it');
    if (denial) return NextResponse.json({ verified: false, error: denial.error }, { status: denial.status });
    const result = await verifySite({ kind: 'board', chainId: base.id, address: board }, url, null);
    return NextResponse.json({ ...result, ...(!result.verified && { error: result.message }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof SDKError ? error.message : 'Site verification unavailable.' }, { status: error instanceof SDKError ? error.status : 503 });
  }
}

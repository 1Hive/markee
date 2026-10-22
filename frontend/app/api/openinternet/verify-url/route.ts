import { NextRequest, NextResponse } from 'next/server';
import { verifySite } from '@/lib/sdk/site-verification';
import { address, object, SDKError } from '@/lib/sdk/validation';
import { rateLimit } from '@/lib/sdk/http';
import { readLimitedJsonBody } from '@/lib/sdk/gardens/body';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  try {
    await rateLimit(req);
    const body = object(await readLimitedJsonBody(req, 4096));
    // Markee's own verification UI verifies a supplied external site.
    const result = await verifySite({ kind: 'board', chainId: 8453, address: address(body.address) }, body.url, null);
    return NextResponse.json({ ...result, ...(!result.verified && { error: result.message }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof SDKError ? error.message : 'Site verification unavailable.' }, { status: error instanceof SDKError ? error.status : 503 });
  }
}

// Adapted from Gardens V2 apps/web/app/api/markee/community/route.ts at 078d17954ad38dba7a142eb3cee59002f44d303f.
import { NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { chainConfigMap } from "../chains";
import { markeeAdapter } from "./revenue";
import { displayCache, displayCacheConfigured } from '../cached-display';
import { SnapshotUnavailable } from '../snapshot-cache';

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const jsonError = (error: string, status: number) =>
  NextResponse.json(
    { error },
    { headers: { "Cache-Control": "no-store" }, status },
  );

export async function GET(request: NextRequest) {
  const chainId = Number(request.nextUrl.searchParams.get("chainId"));
  const community = request.nextUrl.searchParams.get("community");

  if (
    !Number.isSafeInteger(chainId) ||
    !Object.prototype.hasOwnProperty.call(chainConfigMap, chainId) ||
    community == null ||
    !isAddress(community)
  ) {
    return jsonError("Invalid Markee community request.", 400);
  }

  try {
    if (!displayCacheConfigured() && process.env.NODE_ENV === 'production') return jsonError('Snapshot storage is not configured.', 503);
    const load = () => markeeAdapter.getCommunityIntegration(chainId, getAddress(community));
    const result = displayCacheConfigured()
      ? (await displayCache().read(`community:${chainId}:${community.toLowerCase()}`, load)).data
      : await load();

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof SnapshotUnavailable) return NextResponse.json(
      { error: error.message, code: 'SNAPSHOT_UNAVAILABLE' },
      { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(error.retryAfter) } },
    );
    console.error("[Markee community] Integration lookup failed", error);
    return jsonError("Unable to load the Markee community integration.", 502);
  }
}

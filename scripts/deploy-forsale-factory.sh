#!/usr/bin/env bash
# scripts/deploy-forsale-factory.sh
#
# Deploys one LeaderboardFactory v1.3 contract tagged "For Sale" / "for-sale" -- the shared,
# vertical-agnostic factory all future fixed-price ("For Sale") Markee creation should go through,
# mirroring how streaming ("For Rent") boards already aren't split by platform. Unmodified contract,
# same RevNet terminal/project ID/fee receiver/admin as the existing OpenInternet/GitHub/Superfluid
# v1.3 factories -- see scripts/deploy-v13-factories.sh, which this mirrors for a single factory.
#
# Usage:
#   ACCOUNT=revnet-admin KEYSTORE_PASSWORD=... bash scripts/deploy-forsale-factory.sh
#
# Dry-run (no transactions):
#   DRY_RUN=1 bash scripts/deploy-forsale-factory.sh

set -euo pipefail

RPC="${RPC_URL:-https://mainnet.base.org}"
DRY="${DRY_RUN:-0}"

COOP="0xAf4401E765dFf079aB6021BBb8d46E53E27613DB"
JB_TERMINAL="0x130f5Dd2bD8805443Cf41755253D778a75a67f53"
JB_PROJECT_ID="7"
PLATFORM_FEE_RECEIVER="$COOP"

PLATFORM_NAME="For Sale"
PLATFORM_ID="for-sale"

if [[ "$DRY" == "0" ]]; then
  if [[ -n "${ACCOUNT:-}" ]]; then
    SIGN_FLAGS="--account $ACCOUNT"
    [[ -n "${KEYSTORE_PASSWORD:-}" ]] && SIGN_FLAGS="$SIGN_FLAGS --password $KEYSTORE_PASSWORD"
  else
    echo "Error: set ACCOUNT=revnet-admin (keystore)"
    exit 1
  fi
fi

echo "Deploying LeaderboardFactory v1.3: $PLATFORM_NAME ($PLATFORM_ID)"
[[ "$DRY" == "1" ]] && echo "(DRY RUN — no transactions sent)"
echo ""

if [[ "$DRY" == "1" ]]; then
  echo "  [dry] forge create LeaderboardFactory --constructor-args \"$PLATFORM_NAME\" \"$PLATFORM_ID\" $JB_TERMINAL $JB_PROJECT_ID $PLATFORM_FEE_RECEIVER $COOP"
  exit 0
fi

OUTPUT=$(forge create contracts/v1.3/LeaderboardFactory.sol:LeaderboardFactory \
  --rpc-url "$RPC" \
  $SIGN_FLAGS \
  --broadcast \
  --constructor-args \
    "$PLATFORM_NAME" \
    "$PLATFORM_ID" \
    "$JB_TERMINAL" \
    "$JB_PROJECT_ID" \
    "$PLATFORM_FEE_RECEIVER" \
    "$COOP" \
  --json 2>&1)

FACTORY_ADDR=$(echo "$OUTPUT" | grep -oE '"deployedTo":"0x[0-9a-fA-F]{40}"' | grep -oE '0x[0-9a-fA-F]{40}' | head -1)
if [[ -z "$FACTORY_ADDR" ]]; then
  FACTORY_ADDR=$(echo "$OUTPUT" | grep -oE 'Deployed to: 0x[0-9a-fA-F]{40}' | grep -oE '0x[0-9a-fA-F]{40}' | head -1)
fi
if [[ -z "$FACTORY_ADDR" ]]; then
  echo "ERROR: could not parse factory address from output:"
  echo "$OUTPUT"
  exit 1
fi

LB_IMPL=$(cast call "$FACTORY_ADDR" "leaderboardImplementation()(address)" --rpc-url "$RPC")
MARKEE_IMPL=$(cast call "$FACTORY_ADDR" "markeeImplementation()(address)" --rpc-url "$RPC")

echo "=== Deployment complete ==="
echo "  factory:          $FACTORY_ADDR"
echo "  leaderboardImpl:  $LB_IMPL"
echo "  markeeImpl:       $MARKEE_IMPL"
echo ""
echo "Set in frontend/.env.local (and Vercel env):"
echo "  NEXT_PUBLIC_FOR_SALE_FACTORY=$FACTORY_ADDR"

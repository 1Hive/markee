#!/usr/bin/env bash
# scripts/deploy-v13-factories.sh
#
# Deploys 3 LeaderboardFactory v1.3 contracts (OI, GitHub, Superfluid).
# Each factory constructor deploys its own Leaderboard and Markee implementations.
#
# Usage:
#   ACCOUNT=revnet-admin KEYSTORE_PASSWORD=... bash scripts/deploy-v13-factories.sh
#
# Dry-run (no transactions):
#   DRY_RUN=1 bash scripts/deploy-v13-factories.sh

set -euo pipefail

RPC="${RPC_URL:-https://mainnet.base.org}"
DRY="${DRY_RUN:-0}"

COOP="0xAf4401E765dFf079aB6021BBb8d46E53E27613DB"
JB_TERMINAL="0x2dB6d704058E552DeFE415753465df8dF0361846"
JB_PROJECT_ID="152"
PLATFORM_FEE_RECEIVER="$COOP"

if [[ "$DRY" == "0" ]]; then
  if [[ -n "${ACCOUNT:-}" ]]; then
    SIGN_FLAGS="--account $ACCOUNT"
    [[ -n "${KEYSTORE_PASSWORD:-}" ]] && SIGN_FLAGS="$SIGN_FLAGS --password $KEYSTORE_PASSWORD"
  else
    echo "Error: set ACCOUNT=revnet-admin (keystore)"
    exit 1
  fi
fi

FACTORIES=(
  "Open Internet:openinternet"
  "GitHub:github"
  "Superfluid:superfluid"
)

echo "Deploying 3 LeaderboardFactory v1.3 contracts"
[[ "$DRY" == "1" ]] && echo "(DRY RUN — no transactions sent)"
echo ""

for entry in "${FACTORIES[@]}"; do
  PLATFORM_NAME="${entry%%:*}"
  PLATFORM_ID="${entry##*:}"

  echo "Deploying factory: $PLATFORM_NAME ($PLATFORM_ID)"

  if [[ "$DRY" == "1" ]]; then
    echo "  [dry] forge create LeaderboardFactory --constructor-args \"$PLATFORM_NAME\" \"$PLATFORM_ID\" $JB_TERMINAL $JB_PROJECT_ID $PLATFORM_FEE_RECEIVER $COOP"
    echo ""
    continue
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
    # Fallback: grep for "Deployed to:" in non-JSON output
    FACTORY_ADDR=$(echo "$OUTPUT" | grep -oE 'Deployed to: 0x[0-9a-fA-F]{40}' | grep -oE '0x[0-9a-fA-F]{40}' | head -1)
  fi
  if [[ -z "$FACTORY_ADDR" ]]; then
    echo "ERROR: could not parse factory address from output:"
    echo "$OUTPUT"
    exit 1
  fi

  # Read implementation addresses from the deployed factory
  LB_IMPL=$(cast call "$FACTORY_ADDR" "leaderboardImplementation()(address)" --rpc-url "$RPC")
  MARKEE_IMPL=$(cast call "$FACTORY_ADDR" "markeeImplementation()(address)" --rpc-url "$RPC")

  echo "  factory:               $FACTORY_ADDR"
  echo "  leaderboardImpl:       $LB_IMPL"
  echo "  markeeImpl:            $MARKEE_IMPL"
  echo ""
done

echo "=== Deployment complete ==="
echo "Set these in migrate-to-v13.sh before running:"
echo ""
echo "  FACTORY_OI=\"<Open Internet factory address>\""
echo "  FACTORY_GH=\"<GitHub factory address>\""
echo "  FACTORY_SF=\"<Superfluid factory address>\""

#!/usr/bin/env bash
# scripts/migrate-to-v13.sh
#
# Migrates all 21 v1.2 leaderboards → v1.3.
# For each leaderboard:
#   1. createLeaderboard on the v1.3 factory (EOA becomes temporary admin)
#   2. migrateFromLegacy for every Markee (reads owner/message/name/funds from old clone)
#   3. Set custom minimumPrice/maxMessageLength/maxNameLength if they differ from factory defaults
#   4. setAdmin(COOP) to hand ownership to the Coop multisig
#
# Run deploy-v13-factories.sh first and paste the addresses into the three variables below.
#
# Usage:
#   ACCOUNT=revnet-admin KEYSTORE_PASSWORD=... bash scripts/migrate-to-v13.sh
#
# Dry-run (no transactions):
#   DRY_RUN=1 bash scripts/migrate-to-v13.sh

set -euo pipefail

# ─── Set these after running deploy-v13-factories.sh ─────────────────────────
FACTORY_OI="0xFD488A0fE8D4Fa99B4A6016EA9C49a860A553F7c"
FACTORY_GH="0xdF2A716452a3960619cDdDCDe4E10eACcFFDa0A2"
FACTORY_SF="0xC497187AAa35C26b0008B43C10A6F6300b7eBcad"
# ─────────────────────────────────────────────────────────────────────────────

RPC="${RPC_URL:-https://mainnet.base.org}"
DRY="${DRY_RUN:-0}"
COOP="0xAf4401E765dFf079aB6021BBb8d46E53E27613DB"

# Factory defaults — matches v1.3 constructor
DEFAULT_MIN_PRICE="1000000000000000"  # 0.001 ETH in wei
DEFAULT_MAX_MSG="222"
DEFAULT_MAX_NAME="22"

if [[ "$DRY" == "0" ]]; then
  if [[ -z "$FACTORY_OI" || -z "$FACTORY_GH" || -z "$FACTORY_SF" ]]; then
    echo "Error: set FACTORY_OI, FACTORY_GH, FACTORY_SF at the top of this script"
    exit 1
  fi
  if [[ -n "${ACCOUNT:-}" ]]; then
    SIGN_FLAGS="--account $ACCOUNT"
    [[ -n "${KEYSTORE_PASSWORD:-}" ]] && SIGN_FLAGS="$SIGN_FLAGS --password $KEYSTORE_PASSWORD"
  else
    echo "Error: set ACCOUNT=revnet-admin (keystore)"
    exit 1
  fi
fi

# ─── Leaderboard list ─────────────────────────────────────────────────────────
# Format: FACTORY_VAR :: OLD_V12_ADDRESS
# All are transferred to COOP admin after migration.

FACTORY_VARS=()
OLD_ADDRS=()

# v1.2 OI leaderboards → v1.3 OI factory
FACTORY_VARS+=("FACTORY_OI"); OLD_ADDRS+=("0xa9a65432a1DaF9bdB67542b75F341E4361AecC54")  # Honeyswap
FACTORY_VARS+=("FACTORY_OI"); OLD_ADDRS+=("0xf73CaB6d43DF28798AF171Df41EC12155B5C725c")  # Gitcoin
FACTORY_VARS+=("FACTORY_OI"); OLD_ADDRS+=("0x4bA55B631C23487519DaCd909500aCCd714C4648")  # Matias
FACTORY_VARS+=("FACTORY_OI"); OLD_ADDRS+=("0x07a8d34c350C66D6A7e30dbf9b3f8dcC67b70aff")  # Markee Cooperative
FACTORY_VARS+=("FACTORY_OI"); OLD_ADDRS+=("0x03E9b27cbc55Aa47bbDF6339A1f525bdFB87fBE0")  # Gardens
FACTORY_VARS+=("FACTORY_OI"); OLD_ADDRS+=("0x753C1A3203AD3143ecEF57E986CB72f7da195741")  # Clawchemy

# v1.2 SF leaderboards → v1.3 SF factory
FACTORY_VARS+=("FACTORY_SF"); OLD_ADDRS+=("0x5dCD5003B06506C1fdAb4E77721Ce879575aE3c9")  # Gardens 🌱
FACTORY_VARS+=("FACTORY_SF"); OLD_ADDRS+=("0x2EfF03c0cB4c09583462adEA1abbCeE92b52a742")  # Superfluid

# v1.2 GitHub leaderboards → v1.3 GitHub factory
FACTORY_VARS+=("FACTORY_GH"); OLD_ADDRS+=("0xdbB405000bCc0662b0d72F620acb91eC7E8dCAEa")  # pglavin2/honeyswap-interface
FACTORY_VARS+=("FACTORY_GH"); OLD_ADDRS+=("0x84bC9fEFF57aE16307A4a01b7baBFF05DbD6b4E1")  # 1Hive/markee
FACTORY_VARS+=("FACTORY_GH"); OLD_ADDRS+=("0x172e45B38Dc98A11299C3FF9A308F81132E0934c")  # 1Hive/gardens-v2
FACTORY_VARS+=("FACTORY_GH"); OLD_ADDRS+=("0x0246C6dD1CD13E460DaDAC694CB4aBbc8eD4B034")  # web3devz/VeriNet
FACTORY_VARS+=("FACTORY_GH"); OLD_ADDRS+=("0xB64AA75D72eCfC0009053852A656eC84ea65F30E")  # bitpixi2/deviantclaw
FACTORY_VARS+=("FACTORY_GH"); OLD_ADDRS+=("0x23172551399f19A988a3df12680305aB2cA50214")  # JimmyNagles/agent-verification-network #1
FACTORY_VARS+=("FACTORY_GH"); OLD_ADDRS+=("0x688E6e140314DFdC6817420F27F29c97B5947171")  # web3devz/agentcred
FACTORY_VARS+=("FACTORY_GH"); OLD_ADDRS+=("0x3569d07f2007Ca4ac5ea4AeD2F40f4A61255cFd1")  # Timidan/synth-x
FACTORY_VARS+=("FACTORY_GH"); OLD_ADDRS+=("0x8D0e06422bF9E860A9543ABb64d5304eAeeFF5e8")  # nativ3ai/hermes
FACTORY_VARS+=("FACTORY_GH"); OLD_ADDRS+=("0x64d232EF48580160663F96983f4BA2Bad735c701")  # JimmyNagles/agent-verification-network #2
FACTORY_VARS+=("FACTORY_GH"); OLD_ADDRS+=("0x9dAB2B08033268B0414016282152fcB82017fbc8")  # web3devz/Soulbyte
FACTORY_VARS+=("FACTORY_GH"); OLD_ADDRS+=("0x98F4235FBE3a134b21eF75d6319BF5Fc2FE8cCB0")  # web3sim/PolicyPay
FACTORY_VARS+=("FACTORY_GH"); OLD_ADDRS+=("0x713AF7f43D51470f0b9D40133203611ba729c596")  # web3sim/HelixChain

TOTAL=${#OLD_ADDRS[@]}
echo "Migrating $TOTAL leaderboards from v1.2 → v1.3"
[[ "$DRY" == "1" ]] && echo "(DRY RUN — no transactions sent)"
echo ""

NEW_ADDRS=()

for i in "${!OLD_ADDRS[@]}"; do
  factory_var="${FACTORY_VARS[$i]}"
  old_lb="${OLD_ADDRS[$i]}"
  num=$((i + 1))

  # Resolve factory address from variable name
  factory="${!factory_var}"

  # ── Read state from old v1.2 leaderboard ──────────────────────────────────
  lb_name=$(cast call "$old_lb" "leaderboardName()(string)" --rpc-url "$RPC")
  beneficiary=$(cast call "$old_lb" "beneficiaryAddress()(address)" --rpc-url "$RPC")
  min_price=$(cast call "$old_lb" "minimumPrice()(uint256)" --rpc-url "$RPC" | awk '{print $1}')
  max_msg=$(cast call "$old_lb" "maxMessageLength()(uint256)" --rpc-url "$RPC" | awk '{print $1}')
  max_name=$(cast call "$old_lb" "maxNameLength()(uint256)" --rpc-url "$RPC" | awk '{print $1}')

  markees_raw=$(cast call "$old_lb" "getMarkees(uint256,uint256)(address[])" 0 1000 --rpc-url "$RPC" 2>/dev/null)
  markees=($(echo "$markees_raw" | grep -oE '0x[0-9a-fA-F]{40}'))

  echo "[$num/$TOTAL] $lb_name"
  echo "  old:         $old_lb"
  echo "  beneficiary: $beneficiary"
  echo "  markees:     ${#markees[@]}"

  if [[ "$DRY" == "1" ]]; then
    echo "  [dry] createLeaderboard($beneficiary, $lb_name)"
    for m in "${markees[@]}"; do
      echo "  [dry] migrateFromLegacy($m)"
    done
    [[ "$min_price" != "$DEFAULT_MIN_PRICE" ]] && echo "  [dry] setMinimumPrice($min_price)"
    [[ "$max_msg"   != "$DEFAULT_MAX_MSG"   ]] && echo "  [dry] setMaxMessageLength($max_msg)"
    [[ "$max_name"  != "$DEFAULT_MAX_NAME"  ]] && echo "  [dry] setMaxNameLength($max_name)"
    echo "  [dry] setAdmin($COOP)"
    NEW_ADDRS+=("DRY_RUN")
    echo ""
    continue
  fi

  # ── 1. Create new v1.3 leaderboard ────────────────────────────────────────
  echo "  Creating v1.3 leaderboard..."
  # shellcheck disable=SC2086
  cast send "$factory" "createLeaderboard(address,string)" "$beneficiary" "$lb_name" \
    --rpc-url "$RPC" $SIGN_FLAGS > /dev/null
  sleep 3

  count=$(cast call "$factory" "leaderboardCount()(uint256)" --rpc-url "$RPC")
  prev=$((count - 1))
  new_lb=$(cast call "$factory" "leaderboards(uint256)(address)" "$prev" --rpc-url "$RPC")
  echo "  new:         $new_lb"
  NEW_ADDRS+=("$new_lb")

  # ── 2. Migrate every Markee ────────────────────────────────────────────────
  for m in "${markees[@]}"; do
    echo "  migrateFromLegacy($m)"
    # shellcheck disable=SC2086
    cast send "$new_lb" "migrateFromLegacy(address)" "$m" \
      --rpc-url "$RPC" $SIGN_FLAGS > /dev/null
    sleep 2
  done

  # ── 3. Set custom params if different from factory defaults ────────────────
  if [[ "$min_price" != "$DEFAULT_MIN_PRICE" ]]; then
    echo "  setMinimumPrice($min_price)"
    # shellcheck disable=SC2086
    cast send "$new_lb" "setMinimumPrice(uint256)" "$min_price" \
      --rpc-url "$RPC" $SIGN_FLAGS > /dev/null
    sleep 2
  fi
  if [[ "$max_msg" != "$DEFAULT_MAX_MSG" ]]; then
    echo "  setMaxMessageLength($max_msg)"
    # shellcheck disable=SC2086
    cast send "$new_lb" "setMaxMessageLength(uint256)" "$max_msg" \
      --rpc-url "$RPC" $SIGN_FLAGS > /dev/null
    sleep 2
  fi
  if [[ "$max_name" != "$DEFAULT_MAX_NAME" ]]; then
    echo "  setMaxNameLength($max_name)"
    # shellcheck disable=SC2086
    cast send "$new_lb" "setMaxNameLength(uint256)" "$max_name" \
      --rpc-url "$RPC" $SIGN_FLAGS > /dev/null
    sleep 2
  fi

  # ── 4. Transfer admin to Coop multisig ────────────────────────────────────
  echo "  setAdmin($COOP)"
  # shellcheck disable=SC2086
  cast send "$new_lb" "setAdmin(address)" "$COOP" \
    --rpc-url "$RPC" $SIGN_FLAGS > /dev/null
  sleep 3

  echo "  ✓"
  echo ""
done

echo "=== Migration complete ==="
echo ""
echo "Old v1.2 → New v1.3 addresses:"
echo ""
for i in "${!OLD_ADDRS[@]}"; do
  echo "  ${OLD_ADDRS[$i]} → ${NEW_ADDRS[$i]}"
done

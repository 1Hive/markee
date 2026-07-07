#!/usr/bin/env bash
# scripts/migrate-v11-to-v13.sh
#
# Migrates all remaining v1.1 leaderboards → v1.3 across three legacy factories:
#   - SF v1.1:  0x1E1b0C22e2C6C7b46ABb0F25231c7eecD4f0A2d8  (110 leaderboards, 184 markees)
#   - OI v1.1a: 0xb9922E2bdbA79190F0da51Fe362297Ef214eD254  (10 leaderboards, ~44 markees)
#   - OI v1.1b: 0x3f9f7C070f03167C0A90Ee7C2c5863d6F15F7E6D  (6 leaderboards, ~6 markees)
#
# For each leaderboard:
#   1. createLeaderboard on the appropriate v1.3 factory (EOA becomes temporary admin)
#   2. migrateFromLegacy for every Markee
#   3. Set custom minimumPrice/maxMessageLength/maxNameLength if they differ from factory defaults
#   4. setAdmin(COOP)
#
# Already-migrated addresses are skipped (SF_MIGRATED / OI_MIGRATED sets).
#
# Usage:
#   ACCOUNT=revnet-admin KEYSTORE_PASSWORD=... bash scripts/migrate-v11-to-v13.sh
#
# Dry-run (no transactions, prints what would happen):
#   DRY_RUN=1 bash scripts/migrate-v11-to-v13.sh

set -euo pipefail

RPC="${RPC_URL:-https://mainnet.base.org}"
DRY="${DRY_RUN:-0}"
COOP="0xAf4401E765dFf079aB6021BBb8d46E53E27613DB"

FACTORY_SF="0xC497187AAa35C26b0008B43C10A6F6300b7eBcad"
FACTORY_OI="0xFD488A0fE8D4Fa99B4A6016EA9C49a860A553F7c"

LEGACY_SF="0x1E1b0C22e2C6C7b46ABb0F25231c7eecD4f0A2d8"
LEGACY_OI1="0xb9922E2bdbA79190F0da51Fe362297Ef214eD254"
LEGACY_OI2="0x3f9f7C070f03167C0A90Ee7C2c5863d6F15F7E6D"

# Factory defaults — matches v1.3 constructor
DEFAULT_MIN_PRICE="1000000000000000"  # 0.001 ETH
DEFAULT_MAX_MSG="222"
DEFAULT_MAX_NAME="22"

# Already migrated from SF v1.1 — skip these
SF_MIGRATED=(
  "0xaec94b5fc02c3b7c3aedd79522bc0c62309486a7"  # Gardens 🌱 → 0xC76Bf829...
)

# Already migrated from OI v1.1 — skip these
OI_MIGRATED=(
  "0x9eb8939fbc11a546617bc4c55e9afa4d4d847d80"  # Honeyswap
  "0x56f0e84de401198d485bbe30fe13651b0f03b165"  # Gitcoin
  "0xf47cbd51123d4e74128d144c65be092c16134bea"  # Matias
  "0xc981e99bfb1349904c56bdafc429ce04e5ad9ce4"  # Markee Cooperative
  "0x660a5805384a68de57709bd89124b73b8c03371c"  # Gardens
  "0x824f948bb0afd7a9bc360df134fa353fd3ce7ce5"  # Clawchemy
)

if [[ "$DRY" == "0" ]]; then
  if [[ -n "${ACCOUNT:-}" ]]; then
    SIGN_FLAGS="--account $ACCOUNT"
    [[ -n "${KEYSTORE_PASSWORD:-}" ]] && SIGN_FLAGS="$SIGN_FLAGS --password $KEYSTORE_PASSWORD"
  else
    echo "Error: set ACCOUNT=revnet-admin (keystore)"
    exit 1
  fi
fi

# ─── Helpers ──────────────────────────────────────────────────────────────────

is_migrated() {
  local addr
  addr=$(echo "$1" | tr '[:upper:]' '[:lower:]')
  shift
  local m ml
  for m in "$@"; do
    ml=$(echo "$m" | tr '[:upper:]' '[:lower:]')
    [[ "$ml" == "$addr" ]] && return 0
  done
  return 1
}

get_addrs() {
  cast call "$1" "getLeaderboards(uint256,uint256)(address[])" 0 500 --rpc-url "$RPC" 2>/dev/null \
    | tr -d '[]' | tr ',' '\n' | tr -d ' \r' | grep -v '^$'
}

cast_retry() {
  local attempts=0 result
  while [[ $attempts -lt 4 ]]; do
    if result=$(eval "$@" 2>/dev/null); then
      echo "$result"
      return 0
    fi
    attempts=$((attempts + 1))
    [[ $attempts -lt 4 ]] && sleep 3
  done
  echo "cast_retry FAILED after 4 attempts: $*" >&2
  return 1
}

# ─── Output file for address map ──────────────────────────────────────────────
# Append-only — safe to re-run; already-mapped addresses are skipped below.
MAP_FILE="$(dirname "$0")/v11-to-v13-addresses.txt"
touch "$MAP_FILE"

# Build a set of old addresses already in the map file so re-runs skip them.
ALREADY_MAPPED=()
while IFS=' ' read -r old_addr _rest; do
  [[ -n "$old_addr" ]] && ALREADY_MAPPED+=("$old_addr")
done < "$MAP_FILE"
echo "Resuming: ${#ALREADY_MAPPED[@]} leaderboards already mapped, skipping."

# ─── Migration function ───────────────────────────────────────────────────────

migrate_factory() {
  local legacy_factory="$1"
  local v13_factory="$2"
  local label="$3"
  # remaining args are already-migrated addresses
  shift 3
  local migrated=("$@")

  echo ""
  echo "=== $label ==="
  echo "  legacy: $legacy_factory"
  echo "  v1.3:   $v13_factory"
  echo ""

  local num=0 skipped=0

  while IFS= read -r old_lb; do
    [[ -z "$old_lb" ]] && continue

    if is_migrated "$old_lb" "${migrated[@]}"; then
      echo "  [skip] $old_lb (already migrated)"
      skipped=$((skipped + 1))
      continue
    fi

    if is_migrated "$old_lb" "${ALREADY_MAPPED[@]+"${ALREADY_MAPPED[@]}"}"; then
      echo "  [skip] $old_lb (already in map file)"
      skipped=$((skipped + 1))
      continue
    fi

    num=$((num + 1))

    # Read state from old leaderboard
    lb_name=$(cast_retry "cast call '$old_lb' 'leaderboardName()(string)' --rpc-url '$RPC'") || { echo "  [error] leaderboardName fetch failed, skipping $old_lb" >&2; continue; }
    beneficiary=$(cast_retry "cast call '$old_lb' 'beneficiaryAddress()(address)' --rpc-url '$RPC'") || { echo "  [error] beneficiaryAddress fetch failed, skipping $old_lb" >&2; continue; }
    min_price=$(cast_retry "cast call '$old_lb' 'minimumPrice()(uint256)' --rpc-url '$RPC'" | awk '{print $1}') || min_price="$DEFAULT_MIN_PRICE"
    max_msg=$(cast_retry "cast call '$old_lb' 'maxMessageLength()(uint256)' --rpc-url '$RPC'" | awk '{print $1}') || max_msg="$DEFAULT_MAX_MSG"
    max_name=$(cast_retry "cast call '$old_lb' 'maxNameLength()(uint256)' --rpc-url '$RPC'" | awk '{print $1}') || max_name="$DEFAULT_MAX_NAME"

    # cast returns strings with surrounding quotes — strip them so the v1.3 factory doesn't see '"Graven Fan Club"'
    lb_name=$(echo "$lb_name" | sed 's/^"//;s/"$//')
    if [[ -z "$lb_name" ]]; then
      echo "  [warn] empty name for $old_lb — skipping"
      continue
    fi

    markees=()
    while IFS= read -r m; do
      [[ -n "$m" ]] && markees+=("$m")
    done < <(cast call "$old_lb" "getMarkees(uint256,uint256)(address[])" 0 1000 --rpc-url "$RPC" 2>/dev/null \
      | tr -d '[]' | tr ',' '\n' | tr -d ' \r' | grep -v '^$' || true)

    echo "  [$num] $lb_name"
    echo "       old:         $old_lb"
    echo "       beneficiary: $beneficiary"
    echo "       markees:     ${#markees[@]}"

    if [[ "$DRY" == "1" ]]; then
      echo "       [dry] createLeaderboard($beneficiary, $lb_name)"
      for m in "${markees[@]+"${markees[@]}"}"; do
        echo "       [dry] migrateFromLegacy($m)"
      done
      [[ "${min_price:-$DEFAULT_MIN_PRICE}" != "$DEFAULT_MIN_PRICE" ]] && echo "       [dry] setMinimumPrice($min_price)"
      [[ "${max_msg:-$DEFAULT_MAX_MSG}"     != "$DEFAULT_MAX_MSG"   ]] && echo "       [dry] setMaxMessageLength($max_msg)"
      [[ "${max_name:-$DEFAULT_MAX_NAME}"   != "$DEFAULT_MAX_NAME"  ]] && echo "       [dry] setMaxNameLength($max_name)"
      echo "       [dry] setAdmin($COOP)"
      echo ""
      continue
    fi

    # 1. Create new v1.3 leaderboard
    echo "       Creating v1.3 leaderboard..."
    local send_attempts=0
    until cast send "$v13_factory" "createLeaderboard(address,string)" "$beneficiary" "$lb_name" \
      --rpc-url "$RPC" $SIGN_FLAGS > /dev/null 2>&1; do
      send_attempts=$((send_attempts + 1))
      [[ $send_attempts -ge 4 ]] && { echo "       [error] createLeaderboard failed after 4 attempts, skipping" >&2; continue 2; }
      echo "       [retry $send_attempts] createLeaderboard failed, retrying in 5s..."
      sleep 5
    done
    sleep 3

    lb_count=$(cast call "$v13_factory" "leaderboardCount()(uint256)" --rpc-url "$RPC" | awk '{print $1}')
    prev=$((lb_count - 1))
    new_lb=$(cast call "$v13_factory" "leaderboards(uint256)(address)" "$prev" --rpc-url "$RPC")
    echo "       new:         $new_lb"

    echo "${old_lb} ${new_lb}" >> "$MAP_FILE"

    # 2. Migrate every Markee
    for m in "${markees[@]+"${markees[@]}"}"; do
      echo "       migrateFromLegacy($m)"
      # shellcheck disable=SC2086
      local mig_attempts=0
      until cast send "$new_lb" "migrateFromLegacy(address)" "$m" \
        --rpc-url "$RPC" $SIGN_FLAGS > /dev/null 2>&1; do
        mig_attempts=$((mig_attempts + 1))
        [[ $mig_attempts -ge 4 ]] && { echo "       [error] migrateFromLegacy($m) failed after 4 attempts" >&2; break; }
        echo "       [retry $mig_attempts] migrateFromLegacy failed, retrying in 5s..."
        sleep 5
      done
      sleep 2
    done

    # 3. Set custom params if different from factory defaults
    if [[ "${min_price:-$DEFAULT_MIN_PRICE}" != "$DEFAULT_MIN_PRICE" ]]; then
      echo "       setMinimumPrice($min_price)"
      # shellcheck disable=SC2086
      cast send "$new_lb" "setMinimumPrice(uint256)" "$min_price" \
        --rpc-url "$RPC" $SIGN_FLAGS > /dev/null
      sleep 2
    fi
    if [[ "${max_msg:-$DEFAULT_MAX_MSG}" != "$DEFAULT_MAX_MSG" ]]; then
      echo "       setMaxMessageLength($max_msg)"
      # shellcheck disable=SC2086
      cast send "$new_lb" "setMaxMessageLength(uint256)" "$max_msg" \
        --rpc-url "$RPC" $SIGN_FLAGS > /dev/null
      sleep 2
    fi
    if [[ "${max_name:-$DEFAULT_MAX_NAME}" != "$DEFAULT_MAX_NAME" ]]; then
      echo "       setMaxNameLength($max_name)"
      # shellcheck disable=SC2086
      cast send "$new_lb" "setMaxNameLength(uint256)" "$max_name" \
        --rpc-url "$RPC" $SIGN_FLAGS > /dev/null
      sleep 2
    fi

    # 4. Transfer admin to Coop multisig
    echo "       setAdmin($COOP)"
    local admin_attempts=0
    until cast send "$new_lb" "setAdmin(address)" "$COOP" \
      --rpc-url "$RPC" $SIGN_FLAGS > /dev/null 2>&1; do
      admin_attempts=$((admin_attempts + 1))
      [[ $admin_attempts -ge 4 ]] && { echo "       [error] setAdmin failed after 4 attempts" >&2; break; }
      echo "       [retry $admin_attempts] setAdmin failed, retrying in 5s..."
      sleep 5
    done
    sleep 3

    echo "       ✓"
    echo ""
  done < <(get_addrs "$legacy_factory")

  echo "  Done: $num migrated, $skipped skipped"
}

# ─── Run ──────────────────────────────────────────────────────────────────────

echo "Migrating v1.1 leaderboards → v1.3"
[[ "$DRY" == "1" ]] && echo "(DRY RUN — no transactions sent)"

migrate_factory "$LEGACY_SF"  "$FACTORY_SF" "SF v1.1"  "${SF_MIGRATED[@]}"
migrate_factory "$LEGACY_OI1" "$FACTORY_OI" "OI v1.1a" "${OI_MIGRATED[@]}"
migrate_factory "$LEGACY_OI2" "$FACTORY_OI" "OI v1.1b" "${OI_MIGRATED[@]}"

echo ""
echo "=== Complete ==="
if [[ "$DRY" == "0" ]]; then
  echo ""
  echo "Address map written to: $MAP_FILE"
  echo "Use this to update OLD_TO_NEW_SF_LEADERBOARDS and the OI redirect maps in the frontend."
fi

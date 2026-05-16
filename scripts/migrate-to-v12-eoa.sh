#!/usr/bin/env bash
# scripts/migrate-to-v12-eoa.sh
#
# Migrates all v1.1 Leaderboards to v1.2 using Paul's EOA (0x809c9f8...).
# For each leaderboard:
#   1. createLeaderboard on the appropriate v1.2 factory
#   2. migrateFromLegacy for every Markee on the old v1.1 leaderboard
#   3. setAdmin(Coop) for the 4 Coop-owned leaderboards
#
# Usage:
#   ACCOUNT=revnet-admin KEYSTORE_PASSWORD=... bash scripts/migrate-to-v12-eoa.sh
#
# Dry-run (no transactions):
#   DRY_RUN=1 bash scripts/migrate-to-v12-eoa.sh

set -euo pipefail

RPC="${RPC_URL:-https://mainnet.base.org}"
DRY="${DRY_RUN:-0}"
COOP="0xAf4401E765dFf079aB6021BBb8d46E53E27613DB"

FACTORY_OI="0x231C5d1374f1Ce0Cc0B9bc3Eda7E03785dD47fe5"
FACTORY_GH="0x0A880A8C102D16325eaa6b426AD3acd48338B501"
FACTORY_SF="0x72AB2bf7A691Dc331bC0736050A02E7F3a82d352"

if [[ "$DRY" == "0" ]]; then
  if [[ -n "${ACCOUNT:-}" ]]; then
    SIGN_FLAGS="--account $ACCOUNT"
    [[ -n "${KEYSTORE_PASSWORD:-}" ]] && SIGN_FLAGS="$SIGN_FLAGS --password $KEYSTORE_PASSWORD"
  else
    echo "Error: set ACCOUNT=revnet-admin (keystore) or PRIVATE_KEY=0x..."
    exit 1
  fi
fi

# ─── Leaderboard data ─────────────────────────────────────────────────────────
# Format per entry: FACTORY :: OLD_ADDRESS :: BENEFICIARY :: TRANSFER_ADMIN :: NAME
# TRANSFER_ADMIN = PAUL (keep) | COOP (transfer to Coop multisig)

FACTORIES=()
OLD_ADDRS=()
BENEFICIARIES=()
TRANSFER_ADMINS=()
LB_NAMES=()

# OI leaderboards — Paul stays admin
FACTORIES+=("$FACTORY_OI");  OLD_ADDRS+=("0x9Eb8939fbc11A546617bc4C55e9AFa4D4d847d80"); BENEFICIARIES+=("0xc6c2E9EFB898A42DB4137B07b727b45e0C353d81"); TRANSFER_ADMINS+=("PAUL"); LB_NAMES+=("Honeyswap")
FACTORIES+=("$FACTORY_OI");  OLD_ADDRS+=("0x56f0e84de401198d485bbe30fe13651b0f03b165"); BENEFICIARIES+=("0xde21F729137C5Af1b01d73aF1dC21eFfa2B8a0d6"); TRANSFER_ADMINS+=("PAUL"); LB_NAMES+=("Gitcoin")
FACTORIES+=("$FACTORY_OI");  OLD_ADDRS+=("0xf47cbd51123d4e74128d144c65be092c16134bea"); BENEFICIARIES+=("0xa25211B64D041F690C0c818183E32f28ba9647Dd"); TRANSFER_ADMINS+=("PAUL"); LB_NAMES+=("Matias")

# GitHub leaderboards — Paul stays admin
FACTORIES+=("$FACTORY_GH");  OLD_ADDRS+=("0xb974D9DF9b6302Ff99b9cc18B1a14fF363aaeE21"); BENEFICIARIES+=("0xc6c2E9EFB898A42DB4137B07b727b45e0C353d81"); TRANSFER_ADMINS+=("PAUL"); LB_NAMES+=("pglavin2/honeyswap-interface — README.md")
FACTORIES+=("$FACTORY_GH");  OLD_ADDRS+=("0x670986ce867674B280B19B0e406C840113224Fb6"); BENEFICIARIES+=("0xAf4401E765dFf079aB6021BBb8d46E53E27613DB"); TRANSFER_ADMINS+=("PAUL"); LB_NAMES+=("1Hive/markee — SKILL.md")
FACTORIES+=("$FACTORY_GH");  OLD_ADDRS+=("0x2335bfa938b60C73F0a1d62C6ecc747e8C516d2c"); BENEFICIARIES+=("0xd7a3D3A7dd35b8e81FC0b83C032D0ED3261417D9"); TRANSFER_ADMINS+=("PAUL"); LB_NAMES+=("1Hive/gardens-v2 — README.md")
FACTORIES+=("$FACTORY_GH");  OLD_ADDRS+=("0xd5E62EAc5e144A0CB09774aE9285D50E88667dae"); BENEFICIARIES+=("0x98d67F2A45AF911798fF1E094520DA12C3FaA9dd"); TRANSFER_ADMINS+=("PAUL"); LB_NAMES+=("web3devz/VeriNet — README.md")
FACTORIES+=("$FACTORY_GH");  OLD_ADDRS+=("0x6061c7E557CCCE69Ba804AebA43A9cd7aa157078"); BENEFICIARIES+=("0xEc11EEa22DCaA37A31b441FB7d2b503e842F6E50"); TRANSFER_ADMINS+=("PAUL"); LB_NAMES+=("bitpixi2/deviantclaw")
FACTORIES+=("$FACTORY_GH");  OLD_ADDRS+=("0x254A9CED62b214Ee1998C7C7934eE25a57E3Fbf9"); BENEFICIARIES+=("0x135f95b3B4676fFDa0b86f7575EAB59eE1f3F501"); TRANSFER_ADMINS+=("PAUL"); LB_NAMES+=("JimmyNagles/agent-verification-network #1")
FACTORIES+=("$FACTORY_GH");  OLD_ADDRS+=("0x61bac5DdCA2519C94B1aC9eb3e9E563B4375729B"); BENEFICIARIES+=("0x98d67F2A45AF911798fF1E094520DA12C3FaA9dd"); TRANSFER_ADMINS+=("PAUL"); LB_NAMES+=("web3devz/agentcred")
FACTORIES+=("$FACTORY_GH");  OLD_ADDRS+=("0x253E91dCc7bD56E3695348C3BB0BC9fEBF6f01b5"); BENEFICIARIES+=("0xdFd9945E82aE729deabDB0C1d57a16fb884CAD83"); TRANSFER_ADMINS+=("PAUL"); LB_NAMES+=("Timidan/synth-x")
FACTORIES+=("$FACTORY_GH");  OLD_ADDRS+=("0x57F50086e359D24Cc65bcc5614E30123Ef39EC76"); BENEFICIARIES+=("0xf26a8e70Ac16626400556bD21C1dE5Ef46E415a6"); TRANSFER_ADMINS+=("PAUL"); LB_NAMES+=("nativ3ai/hermes-geopolitical-market-sim")
FACTORIES+=("$FACTORY_GH");  OLD_ADDRS+=("0x7858dA9eAe7C811c71c2EEAa9948C5ef570C43A2"); BENEFICIARIES+=("0xd68D8C09a1067814De8b08Eca443B0595a2b48Ba"); TRANSFER_ADMINS+=("PAUL"); LB_NAMES+=("JimmyNagles/agent-verification-network #2")
FACTORIES+=("$FACTORY_GH");  OLD_ADDRS+=("0x3718f5B053e8427dF99c486cB5A6E60066345223"); BENEFICIARIES+=("0x98d67F2A45AF911798fF1E094520DA12C3FaA9dd"); TRANSFER_ADMINS+=("PAUL"); LB_NAMES+=("web3devz/Soulbyte")
FACTORIES+=("$FACTORY_GH");  OLD_ADDRS+=("0x284e7C8d31f0235230e549D475591ad91B0c12B9"); BENEFICIARIES+=("0x022A49dF8aaE2f38491800019A0B25c615fB0172"); TRANSFER_ADMINS+=("PAUL"); LB_NAMES+=("web3sim/PolicyPay")
FACTORIES+=("$FACTORY_GH");  OLD_ADDRS+=("0x6459b0b0a3F8C19cb28464B248DfF6A8Cc8cA210"); BENEFICIARIES+=("0xeFb17B8F14f013aA18D9E6f110CCdbfc4dfb3298"); TRANSFER_ADMINS+=("PAUL"); LB_NAMES+=("web3sim/HelixChain")

# SF leaderboard — Paul stays admin
FACTORIES+=("$FACTORY_SF");  OLD_ADDRS+=("0xAec94b5fC02c3B7C3AEDd79522bc0c62309486A7"); BENEFICIARIES+=("0xd7a3D3A7dd35b8e81FC0b83C032D0ED3261417D9"); TRANSFER_ADMINS+=("PAUL"); LB_NAMES+=("Gardens 🌱")

# Coop leaderboards — Paul creates, then transfers admin to Coop
FACTORIES+=("$FACTORY_OI");  OLD_ADDRS+=("0xC981e99bfB1349904C56bdafC429cE04E5AD9Ce4"); BENEFICIARIES+=("0xAf4401E765dFf079aB6021BBb8d46E53E27613DB"); TRANSFER_ADMINS+=("COOP"); LB_NAMES+=("Markee Cooperative")
FACTORIES+=("$FACTORY_OI");  OLD_ADDRS+=("0x660a5805384a68dE57709bd89124B73B8C03371C"); BENEFICIARIES+=("0xd7a3D3A7dd35b8e81FC0b83C032D0ED3261417D9"); TRANSFER_ADMINS+=("COOP"); LB_NAMES+=("Gardens")
FACTORIES+=("$FACTORY_OI");  OLD_ADDRS+=("0x824f948Bb0afd7a9bc360DF134fA353fD3cE7CE5"); BENEFICIARIES+=("0x2fE21E90EdAe41C37af5203b8f15e0D6d3484046"); TRANSFER_ADMINS+=("COOP"); LB_NAMES+=("Clawchemy")
FACTORIES+=("$FACTORY_SF");  OLD_ADDRS+=("0xb6CCc63d3FdC2D22e3147c01AB6A006f32Dd7580"); BENEFICIARIES+=("0xac808840f02c47C05507f48165d2222FF28EF4e1"); TRANSFER_ADMINS+=("COOP"); LB_NAMES+=("Superfluid")

TOTAL=${#OLD_ADDRS[@]}
echo "Migrating $TOTAL leaderboards from v1.1 → v1.2"
[[ "$DRY" == "1" ]] && echo "(DRY RUN — no transactions sent)"
echo ""

NEW_ADDRS=()

for i in "${!OLD_ADDRS[@]}"; do
  factory="${FACTORIES[$i]}"
  old_lb="${OLD_ADDRS[$i]}"
  beneficiary="${BENEFICIARIES[$i]}"
  transfer_admin="${TRANSFER_ADMINS[$i]}"
  lb_name="${LB_NAMES[$i]}"
  num=$((i + 1))

  echo "[$num/$TOTAL] $lb_name"
  echo "  old: $old_lb"

  # Get Markees from old leaderboard
  markees_raw=$(cast call "$old_lb" "getMarkees(uint256,uint256)(address[])" 0 1000 --rpc-url "$RPC" 2>/dev/null)
  markees=($(echo "$markees_raw" | grep -oE '0x[0-9a-fA-F]{40}'))
  echo "  markees to migrate: ${#markees[@]}"

  if [[ "$DRY" == "1" ]]; then
    echo "  [dry] createLeaderboard($beneficiary, \"$lb_name\")"
    for m in "${markees[@]}"; do
      echo "  [dry] migrateFromLegacy($m)"
    done
    [[ "$transfer_admin" == "COOP" ]] && echo "  [dry] setAdmin($COOP)"
    NEW_ADDRS+=("DRY_RUN")
    echo ""
    continue
  fi

  # 1. Create new v1.2 leaderboard
  echo "  Creating v1.2 leaderboard..."
  # shellcheck disable=SC2086
  cast send "$factory" "createLeaderboard(address,string)" "$beneficiary" "$lb_name" \
    --rpc-url "$RPC" $SIGN_FLAGS > /dev/null
  sleep 3

  # Get new leaderboard address (last in factory registry)
  count=$(cast call "$factory" "leaderboardCount()(uint256)" --rpc-url "$RPC")
  prev=$((count - 1))
  new_lb=$(cast call "$factory" "leaderboards(uint256)(address)" "$prev" --rpc-url "$RPC")
  echo "  new:  $new_lb"
  NEW_ADDRS+=("$new_lb")

  # 2. Migrate every Markee
  for m in "${markees[@]}"; do
    echo "  migrateFromLegacy($m)"
    # shellcheck disable=SC2086
    cast send "$new_lb" "migrateFromLegacy(address)" "$m" \
      --rpc-url "$RPC" $SIGN_FLAGS > /dev/null
    sleep 3
  done

  # 3. Transfer admin to Coop if needed
  if [[ "$transfer_admin" == "COOP" ]]; then
    echo "  setAdmin($COOP)"
    # shellcheck disable=SC2086
    cast send "$new_lb" "setAdmin(address)" "$COOP" \
      --rpc-url "$RPC" $SIGN_FLAGS > /dev/null
    sleep 3
  fi

  echo "  ✓"
  echo ""
done

echo "=== Migration complete ==="
echo ""
echo "Old address → New address"
for i in "${!OLD_ADDRS[@]}"; do
  echo "  ${LB_NAMES[$i]}"
  echo "    v1.1: ${OLD_ADDRS[$i]}"
  echo "    v1.2: ${NEW_ADDRS[$i]}"
done

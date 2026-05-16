#!/usr/bin/env bash
# scripts/enable-revnet-eoa.sh
#
# Activates RevNet v6 on all leaderboards where Paul's EOA (0x809c...) is admin.
# Sends 4 transactions per leaderboard in strict order:
#   1. setRevNetTerminal
#   2. setRevNetProjectId
#   3. setPercentToBeneficiary (6200 = 62%)
#   4. setRevNetEnabled(true)   ← always last
#
# Usage:
#   PRIVATE_KEY=0x... bash scripts/enable-revnet-eoa.sh
#
# Dry-run (skip sends, just print):
#   DRY_RUN=1 bash scripts/enable-revnet-eoa.sh

set -euo pipefail

TERMINAL="0x2dB6d704058E552DeFE415753465df8dF0361846"
PROJECT_ID="152"
PERCENT="6200"
RPC="${RPC_URL:-https://mainnet.base.org}"
DRY="${DRY_RUN:-0}"

if [[ -z "${PRIVATE_KEY:-}" && "$DRY" == "0" ]]; then
  echo "Error: set PRIVATE_KEY=0x... before running"
  exit 1
fi

NAMES=(
  "OI / Honeyswap"
  "OI / Gitcoin"
  "OI / Matias"
  "pglavin2/honeyswap-interface"
  "1Hive/markee"
  "1Hive/gardens-v2"
  "web3devz/VeriNet"
  "bitpixi2/deviantclaw"
  "JimmyNagles/AVN #1"
  "web3devz/agentcred"
  "Timidan/synth-x"
  "nativ3ai/hermes"
  "JimmyNagles/AVN #2"
  "web3devz/Soulbyte"
  "web3sim/PolicyPay"
  "web3sim/HelixChain"
)

ADDRS=(
  "0x9Eb8939fbc11A546617bc4C55e9AFa4D4d847d80"
  "0x56f0e84de401198d485bbe30fe13651b0f03b165"
  "0xf47cbd51123d4e74128d144c65be092c16134bea"
  "0xb974D9DF9b6302Ff99b9cc18B1a14fF363aaeE21"
  "0x670986ce867674B280B19B0e406C840113224Fb6"
  "0x2335bfa938b60C73F0a1d62C6ecc747e8C516d2c"
  "0xd5E62EAc5e144A0CB09774aE9285D50E88667dae"
  "0x6061c7E557CCCE69Ba804AebA43A9cd7aa157078"
  "0x254A9CED62b214Ee1998C7C7934eE25a57E3Fbf9"
  "0x61bac5DdCA2519C94B1aC9eb3e9E563B4375729B"
  "0x253E91dCc7bD56E3695348C3BB0BC9fEBF6f01b5"
  "0x57F50086e359D24Cc65bcc5614E30123Ef39EC76"
  "0x7858dA9eAe7C811c71c2EEAa9948C5ef570C43A2"
  "0x3718f5B053e8427dF99c486cB5A6E60066345223"
  "0x284e7C8d31f0235230e549D475591ad91B0c12B9"
  "0x6459b0b0a3F8C19cb28464B248DfF6A8Cc8cA210"
)

TOTAL=${#ADDRS[@]}
echo "Enabling RevNet v6 on $TOTAL leaderboards from 0x809C9f8..."
echo "Terminal: $TERMINAL | Project: $PROJECT_ID | Split: ${PERCENT}bp (62%)"
[[ "$DRY" == "1" ]] && echo "(DRY RUN — no transactions sent)"
echo ""

for i in "${!ADDRS[@]}"; do
  addr="${ADDRS[$i]}"
  name="${NAMES[$i]}"
  num=$((i + 1))
  echo "[$num/$TOTAL] $name  $addr"

  if [[ "$DRY" == "1" ]]; then
    echo "  [dry] setRevNetTerminal($TERMINAL)"
    echo "  [dry] setRevNetProjectId($PROJECT_ID)"
    echo "  [dry] setPercentToBeneficiary($PERCENT)"
    echo "  [dry] setRevNetEnabled(true)"
  else
    cast send "$addr" "setRevNetTerminal(address)" "$TERMINAL" --rpc-url "$RPC" --private-key "$PRIVATE_KEY"
    cast send "$addr" "setRevNetProjectId(uint256)" "$PROJECT_ID" --rpc-url "$RPC" --private-key "$PRIVATE_KEY"
    cast send "$addr" "setPercentToBeneficiary(uint256)" "$PERCENT" --rpc-url "$RPC" --private-key "$PRIVATE_KEY"
    cast send "$addr" "setRevNetEnabled(bool)" "true" --rpc-url "$RPC" --private-key "$PRIVATE_KEY"
  fi

  echo "  ✓"
done

echo ""
echo "Done — $TOTAL leaderboards configured."

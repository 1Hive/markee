#!/usr/bin/env bash
# Deduplicate v11-to-v13-addresses.txt, keeping the first (earliest) mapping
# for each old address. Duplicate entries created by concurrent runs are dropped.
MAP="/Users/paulglavin/markee/scripts/v11-to-v13-addresses.txt"
DEDUPED=$(awk '!seen[$1]++' "$MAP")
echo "$DEDUPED" > "$MAP"
TOTAL=$(wc -l < "$MAP" | tr -d ' ')
echo "Deduped: $TOTAL unique old→new mappings"

#!/usr/bin/env bash
# Generates go/<kind>_v<major>.go from every schemas/<kind>.v<major>.json, replacing
# what was there. Usage: packages/standards/scripts/generate-go.sh
set -euo pipefail

generator=github.com/atombender/go-jsonschema@v0.24.1
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$root/go"

# Remove every generated file first, so a schema that was deleted takes its Go file with it.
for file in "$out"/*.go; do
  [[ -e $file ]] || continue
  if head -n 1 "$file" | grep -q '^// Code generated .* DO NOT EDIT\.$'; then
    rm "$file"
  fi
done

for schema in "$root"/schemas/*.json; do
  name=$(basename "$schema" .json)
  # example.ping.v1 -> ExamplePingV1
  type=""
  IFS='._-' read -r -a parts <<<"$name"
  for part in "${parts[@]}"; do
    type+="$(tr '[:lower:]' '[:upper:]' <<<"${part:0:1}")${part:1}"
  done
  # The schemas have no $id, so the generator keys them by the empty ID.
  go run "$generator" \
    --package standards \
    --tags json \
    --capitalization ID \
    --schema-root-type "=$type" \
    --output "$out/${name//./_}.go" \
    "$schema"
done

(cd "$out" && gofmt -w .)

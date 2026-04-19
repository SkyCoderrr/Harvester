#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
cd "$SCRIPT_DIR/.."

if [ ! -d node_modules ]; then npm install; fi
if [ ! -d web/node_modules ]; then (cd web && npm install); fi

npm run gen:rules-schema || true

npx concurrently -n server,web -c blue,green \
  "npm run dev:watch" \
  "npm run dev:web"

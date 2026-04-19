#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
cd "$SCRIPT_DIR/.."

npm install
(cd web && npm install)
npm run build
echo "Build complete. dist/ and web/dist/ ready."

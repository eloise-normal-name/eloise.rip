#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$PROJECT_ROOT"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required on PATH." >&2
  exit 1
fi

if ! command -v pelican >/dev/null 2>&1; then
  echo "pelican is required on PATH." >&2
  exit 1
fi

rm -rf output
pelican content -o output -s pelicanconf.py
python validate_output.py
npm run cf:pages:deploy

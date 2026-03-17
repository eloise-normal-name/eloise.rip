#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$PROJECT_ROOT"

if ! command -v wrangler >/dev/null 2>&1; then
  echo "wrangler is required on PATH." >&2
  exit 1
fi

if ! command -v pelican >/dev/null 2>&1; then
  echo "pelican is required on PATH." >&2
  exit 1
fi

rm -rf output
pelican
python validate_output.py
wrangler pages deploy output --project-name=eloise-rip

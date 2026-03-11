#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$PROJECT_ROOT"

if ! command -v ghp-import >/dev/null 2>&1; then
  echo "ghp-import is required on PATH." >&2
  exit 1
fi

if [[ ! -d output ]]; then
  echo "output/ does not exist. Build the site before publishing." >&2
  exit 1
fi

ghp-import output
git push origin gh-pages

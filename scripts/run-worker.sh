#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f ".env.local" ]]; then
  set -a
  source ".env.local"
  set +a
elif [[ -f ".env" ]]; then
  set -a
  source ".env"
  set +a
fi

SUPABASE_URL_VALUE="${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-}}"
SUPABASE_SERVICE_ROLE_KEY_VALUE="${SUPABASE_SERVICE_ROLE_KEY:-}"

if [[ -z "$SUPABASE_URL_VALUE" ]]; then
  echo "Worker cannot start: set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL in .env.local or .env." >&2
  exit 1
fi

if [[ -z "$SUPABASE_SERVICE_ROLE_KEY_VALUE" ]]; then
  echo "Worker cannot start: SUPABASE_SERVICE_ROLE_KEY is missing or empty." >&2
  exit 1
fi

if [[ ! -x ".venv/bin/python" ]]; then
  echo "Worker virtualenv is missing. Run: python3 -m venv .venv && .venv/bin/pip install -r worker/requirements.txt" >&2
  exit 1
fi

export SUPABASE_URL="$SUPABASE_URL_VALUE"
export SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY_VALUE"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$ROOT_DIR/.cache}"
export MPLCONFIGDIR="${MPLCONFIGDIR:-$XDG_CACHE_HOME/matplotlib}"

mkdir -p "$XDG_CACHE_HOME" "$MPLCONFIGDIR"

exec .venv/bin/python -m worker.main

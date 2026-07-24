#!/usr/bin/env bash
# Bootstrap local Calora monorepo tooling (does not touch Farq).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env — fill Farq (read-only) and Calorie Scanner keys."
fi

echo "==> Root npm install (workspaces)"
npm install

echo "==> ML venv"
cd "$ROOT/ml"
python3 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
pytest -q || true

echo "Done. Next:"
echo "  • Apply supabase/migrations to your Calorie Scanner project"
echo "  • npm run admin   # ops dashboard"
echo "  • cd mobile && npx expo start"
echo "  • npm run ml:pipeline  # after credentials + GPU"

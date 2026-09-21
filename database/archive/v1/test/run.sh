#!/usr/bin/env bash
# Chạy test RPC trên Supabase LOCAL (Docker) — Spec v0.9 mục 47c.
#
# Không chạy trên project dev: free tier giới hạn 2 active project/org, đã dùng
# hết cho dev + production. Chạy trên dev sẽ làm bẩn dữ liệu và không lặp lại được.
#
#   supabase start          # lần đầu
#   bash database/test/run.sh
set -euo pipefail

DB_URL="${TEST_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "→ Reset schema"
psql "$DB_URL" -q -c "drop schema if exists public cascade; create schema public;" >/dev/null

for f in "$DIR"/migrations/0*.sql; do
  echo "→ $(basename "$f")"
  psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done

echo "→ seed"
psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f "$DIR/seed/001_seed.sql" >/dev/null

echo "→ test"
psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f "$DIR/test/001_rpc_tests.sql" 2>&1 >/dev/null \
  | sed 's/^psql.*NOTICE:  //' | grep -E '^(PASS|FAIL)' || true

echo
echo "Xong. Bất kỳ dòng FAIL nào cũng chặn go-live (mục 55.8)."

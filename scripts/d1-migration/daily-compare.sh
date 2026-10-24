#!/usr/bin/env bash
# Supabase exit step 5: daily read-only compare until the switch (shared/plans/localley-supabase-exit.md).
# Loads the live source into a local D1 through the facade (exit-full-import.mjs) and requires every table to match.
# Silent on success; one notify.sh message on a mismatch, a foreign-key violation or a failed run.
# Pass --dry-run to print the result instead of sending a message (tests, manual checks).
# Cron (agent host, from the app checkout on main): 15 6 * * * apps/Localley/scripts/d1-migration/daily-compare.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
state="$HOME/.local/state/localley/daily-compare"
mkdir -p "$state"
stamp=$(date -u +%Y%m%dT%H%M%S)
env_file="${LOCALLEY_ENV_FILE:-/home/dev/projects/CyberLink/apps/Localley/.env.local}"
set -a; . "$HOME/secrets/keys.env"; . "$env_file"; set +a
if [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "daily-compare: source settings missing in $env_file" >&2; exit 2
fi
# The run's own exit code (a pipe would report the last command's): log first, then read the summary line.
/home/dev/projects/CyberLink/shared/scripts/run-heavy.sh node scripts/d1-migration/exit-full-import.mjs \
  --out "$state/import-$stamp.sql" --report "$state/report-$stamp.json" > "$state/run-$stamp.log" 2>&1
rc=$?
out=$(grep '^{' "$state/run-$stamp.log" | tail -1)
find "$state" -name 'run-*.log' -mtime +14 -delete
# Keep 14 days of reports; the SQL dumps are large, keep the last 3.
find "$state" -name 'report-*.json' -mtime +14 -delete
ls -1t "$state"/import-*.sql 2>/dev/null | tail -n +4 | xargs -r rm -f
if [ $rc -ne 0 ] || ! printf '%s' "$out" | grep -q '"mismatches":\[\]' || ! printf '%s' "$out" | grep -q '"foreignKeyViolations":0'; then
  message="Localley daily D1 compare needs a look (rc=$rc): ${out:0:300}"
  if [ "${1:-}" = "--dry-run" ]; then echo "$message"; else /home/dev/projects/CyberLink/shared/scripts/notify.sh "$message"; fi
  exit 1
fi

#!/usr/bin/env bash
# Tests dash-backup-alerts against stubbed psql rows and pgBackRest JSON, in
# dry-run mode, so nothing is sent. Needs GNU date and jq; CI runs it on
# Ubuntu. Usage: infra/hosts/db/test-alerts.sh
set -euo pipefail

BIN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/files/bin"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir "$work/stub"

# runuser stub: prints $STUB_OUT and exits with $STUB_RC.
cat >"$work/stub/runuser" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "${STUB_OUT:-}"
exit "${STUB_RC:-0}"
STUB
printf '#!/bin/sh\n' >"$work/stub/logger"
chmod +x "$work/stub/runuser" "$work/stub/logger"

export PATH="$work/stub:$PATH" DASH_NOTIFY_DRY_RUN=1 DASH_NOTIFY="$BIN/dash-notify"
export DASH_ALERT_STATE_DIR="$work/state" DASH_ARCHIVE_RECHECK_SECONDS=0
now="$(date +%s)"
failures=0

# expect <name> <grep pattern> <subcommand>: runs it and checks the output.
expect() {
  local name="$1" pattern="$2" out
  shift 2
  out="$(bash "$BIN/dash-backup-alerts" "$@" 2>&1)" || out="exit $?: ${out}"
  if grep -qE "$pattern" <<<"$out"; then
    echo "ok   ${name}"
  else
    echo "FAIL ${name}: expected /${pattern}/, got:"$'\n'"${out}"
    failures=$((failures + 1))
  fi
}

# Row: in_recovery archived_at failed_at archived_wal failed_wal ready oldest_ready_age
row() { STUB_OUT="$*"; export STUB_OUT; }

row f $((now - 60)) 0 000000010000000000000030 - 0 0
expect "idle database is ok" '^WAL archiving: ok$' check-archive

row f $((now - 3600)) $((now - 30)) 000000010000000000000030 000000010000000000000031 1 600
expect "failing archive_command alerts" 'title: Dash: WAL archiving FAILING' check-archive
expect "repeat within 6 hours is held back" 'archive-failing: still alerting' check-archive
echo $((now - 7 * 3600)) >"$work/state/archive-failing"
expect "repeat after 6 hours is sent" 'title: Dash: WAL archiving FAILING' check-archive

row f $((now - 3600)) 0 000000010000000000000030.00000028.backup - 2 $((31 * 60))
expect "segment waiting 31 min alerts, even after a .backup" 'title: Dash: WAL archiving stalled' check-archive

row f $((now - 60)) 0 000000010000000000000031 - 1 120
expect "segment waiting 2 min is ok" '^WAL archiving: ok$' check-archive
[ ! -e "$work/state/archive-failing" ] && [ ! -e "$work/state/archive-stalled" ] ||
  { echo "FAIL recovery left state files"; failures=$((failures + 1)); }

row f $((now - 60)) 0 000000010000000000000031 - 0 0
expect "no state, no recovery" '^WAL archiving: ok$' check-archive
touch "$work/state/archive-failing" "$work/state/archive-stalled"
expect "one combined recovery" 'Cleared: archive-failing archive-stalled\.' check-archive

row "WARNING: something odd"
expect "unparseable row raises archive-check" 'title: Dash: cannot check WAL archiving' check-archive
rm -f "$work/state/"*
touch "$work/state/archive-stalled"
row "psql: connection refused"
STUB_RC=2 expect "failed query raises archive-check, no recovery" 'archive-check: alert sent' check-archive
[ -e "$work/state/archive-stalled" ] ||
  { echo "FAIL a failed query cleared archive-stalled"; failures=$((failures + 1)); }
rm -f "$work/state/"*

row "[{\"name\":\"dash\",\"backup\":[{\"timestamp\":{\"stop\":$((now - 3600))}}],\"status\":{\"message\":\"ok\"}}]"
expect "1h-old backup is ok" 'newest backup is 1h old: ok' check-age
row "[{\"name\":\"dash\",\"backup\":[{\"timestamp\":{\"stop\":$((now - 27 * 3600))}}],\"status\":{\"message\":\"ok\"}}]"
expect "27h-old backup alerts" 'title: Dash backups: newest is 27h old' check-age
row '[{"name":"dash","backup":[],"status":{"message":"no valid backups"}}]'
rm -f "$work/state/"*
expect "no backup alerts" 'title: Dash backups: no backup found' check-age
row "not json"
rm -f "$work/state/"*
expect "unreadable info alerts" 'title: Dash backups: cannot read backup info' check-age

long="$(printf 'x%.0s' $(seq 1 3000))"
out="$(DASH_NOTIFY_DRY_RUN=1 bash "$BIN/dash-notify" t "$long")"
if [ "$(tail -n 1 <<<"$out" | wc -c)" -le 1025 ]; then
  echo "ok   message trimmed to 1024"
else
  echo "FAIL message not trimmed"
  failures=$((failures + 1))
fi

[ "$failures" = 0 ] || { echo "${failures} failed"; exit 1; }
echo "all passed"

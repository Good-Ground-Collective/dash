#!/usr/bin/env bash
# Proves that dash-db's backups restore, point-in-time, on another box.
#
# 1. On dash-db: writes marker rows to a scratch table, takes a differential
#    backup through the real systemd unit, writes more rows, notes the time,
#    then writes rows that must NOT survive the restore.
# 2. Mints a short-lived read-only key for the backup bucket.
# 3. On the scratch box: installs Postgres 18 and pgBackRest, restores to the
#    noted time, and counts the rows.
# 4. Tears the scratch cluster and packages down, revokes the key and drops the
#    scratch table on dash-db.
#
# Uses only the cipher passphrase from ~/.config/dash/infra.env and a Linode
# API token, which is exactly what a real recovery has if dash-db is gone.
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

DB_HOST="${DASH_DB_HOST:-dash-db}"
SCRATCH_HOST="${1:-dash-spare}"
[ "$SCRATCH_HOST" != "$DB_HOST" ] || die "the scratch host must not be ${DB_HOST}"

need_tools curl jq ssh tar
load_linode_token
cipher_pass="$(env_get DASH_PGBACKREST_CIPHER_PASS)"
[ -n "$cipher_pass" ] || die "${ENV_FILE} has no DASH_PGBACKREST_CIPHER_PASS"

run_id="$(date -u +%Y%m%dT%H%M%SZ)"
db_sql() { remote "$DB_HOST" 'sudo -u postgres psql -XAt -v ON_ERROR_STOP=1 -d postgres'; }

bundle=""
key_id=""
table_created=0
cleanup() {
  local rc=$?
  set +e
  echo "== 4. teardown"
  if [ -n "$bundle" ]; then
    if ! remote "$SCRATCH_HOST" "sudo bash '$bundle/remote/teardown.sh' >/dev/null && echo 'teardown: done' && rm -rf '$bundle'"; then
      echo "error: teardown on ${SCRATCH_HOST} FAILED; it may still hold the cipher passphrase in /etc/pgbackrest. Fix it by hand." >&2
      rc=1
    fi
  fi
  if [ -n "$key_id" ]; then
    linode_api DELETE "/object-storage/keys/${key_id}" >/dev/null && echo "revoked key ${key_label}"
  fi
  if [ "$table_created" = 1 ]; then
    echo "DROP TABLE IF EXISTS dash_restore_check" | db_sql >/dev/null && echo "dropped dash_restore_check on ${DB_HOST}"
  fi
  exit "$rc"
}
trap cleanup EXIT

remote "$SCRATCH_HOST" 'test ! -e /var/lib/postgresql && ! id postgres >/dev/null 2>&1 && ! dpkg -s postgresql-common >/dev/null 2>&1' ||
  die "${SCRATCH_HOST} already has Postgres on it; the restore test only runs on a box without it"
bundle="$(push_bundle "$SCRATCH_HOST")"
remote "$SCRATCH_HOST" 'sudo touch /etc/dash-restore-scratch'

echo "== 1. marker rows and backup on ${DB_HOST} (run ${run_id})"
table_created=1
db_sql <<SQL
CREATE TABLE IF NOT EXISTS dash_restore_check (
  run_id text NOT NULL, batch text NOT NULL, n int NOT NULL,
  written_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO dash_restore_check (run_id, batch, n)
SELECT '${run_id}', 'before-backup', g FROM generate_series(1, 100) g;
SQL
remote "$DB_HOST" 'sudo systemctl start dash-pgbackrest@diff.service'
db_sql <<SQL
INSERT INTO dash_restore_check (run_id, batch, n)
SELECT '${run_id}', 'after-backup', g FROM generate_series(1, 50) g;
SQL
sleep 2
target="$(echo "SELECT clock_timestamp()::text" | db_sql)"
sleep 2
db_sql <<SQL
INSERT INTO dash_restore_check (run_id, batch, n)
SELECT '${run_id}', 'after-target', g FROM generate_series(1, 25) g;
SQL
# check forces the WAL holding these rows out to the repo.
remote "$DB_HOST" 'sudo -u postgres pgbackrest --stanza=dash --log-level-console=warn check'
echo "target time: ${target}"
echo "source counts:"
echo "SELECT batch, count(*) FROM dash_restore_check WHERE run_id = '${run_id}' GROUP BY 1 ORDER BY 1" | db_sql

echo "== 2. read-only key"
key_label="dash-pg-restore-${run_id}"
key_json="$(create_bucket_key "$key_label" read_only)"
key_id="$(jq -r .id <<<"$key_json")"
s3_key="$(jq -r .access_key <<<"$key_json")"
s3_secret="$(jq -r .secret_key <<<"$key_json")"
unset key_json
echo "created key ${key_label} (id ${key_id})"

echo "== 3. restore on ${SCRATCH_HOST}"
log="$(mktemp "${TMPDIR:-/tmp}/dash-restore.XXXXXX")"
if ! printf 'S3_KEY=%s\nS3_SECRET=%s\nCIPHER_PASS=%s\n' "$s3_key" "$s3_secret" "$cipher_pass" |
  remote "$SCRATCH_HOST" "sudo bash '$bundle/remote/restore.sh' '$target'" >"$log" 2>&1; then
  tail -40 "$log"
  die "restore failed; full log in ${log}"
fi
grep -E '^(stanza|    (full|diff) backup|        timestamp|restore:)|restore command (begin|end)|recovery stopping' "$log" || true

counts="$(remote "$SCRATCH_HOST" "sudo -u postgres psql -XAt -d postgres -c \"SELECT batch || '=' || count(*) FROM dash_restore_check WHERE run_id = '${run_id}' GROUP BY batch ORDER BY batch\"")"
echo "restored counts:"
echo "$counts"
expected=$'after-backup=50\nbefore-backup=100'
if [ "$counts" = "$expected" ]; then
  echo "RESULT: PASS (point-in-time restore kept the 150 rows written before ${target} and none after)"
else
  echo "RESULT: FAIL (expected: ${expected//$'\n'/, })"
  exit 1
fi

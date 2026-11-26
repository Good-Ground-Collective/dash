#!/usr/bin/env bash
# Restores the dash stanza onto this box as cluster 18/main and starts it.
# Runs as root. Used by restore-test.sh and by the disaster-recovery runbook.
# Usage: restore.sh [<target-time>]   (no target = latest point in the archive)
# Secrets on stdin as NAME=value lines: S3_KEY, S3_SECRET, CIPHER_PASS.
# Refuses to touch an existing 18/main cluster.
set -euo pipefail

TARGET="${1:-}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/files"
DATA=/var/lib/postgresql/18/main

S3_KEY="" S3_SECRET="" CIPHER_PASS=""
while IFS='=' read -r name value; do
  case "$name" in
    S3_KEY | S3_SECRET | CIPHER_PASS) printf -v "$name" '%s' "$value" ;;
  esac
done
[ -n "$S3_KEY" ] && [ -n "$S3_SECRET" ] && [ -n "$CIPHER_PASS" ] ||
  { echo "S3_KEY, S3_SECRET and CIPHER_PASS are required on stdin" >&2; exit 1; }

if [ -d /etc/postgresql/18/main ]; then
  echo "cluster 18/main already exists here; refusing to overwrite it" >&2
  exit 1
fi

bash "$(dirname "${BASH_SOURCE[0]}")/install-packages.sh" --no-main-cluster

install -d -m 755 /etc/pgbackrest /etc/pgbackrest/conf.d
install -m 644 "$SRC/pgbackrest.conf" /etc/pgbackrest/pgbackrest.conf
umask 077
printf '[global]\nrepo1-s3-key=%s\nrepo1-s3-key-secret=%s\nrepo1-cipher-pass=%s\n' \
  "$S3_KEY" "$S3_SECRET" "$CIPHER_PASS" >/etc/pgbackrest/conf.d/dash-secrets.conf
umask 022
unset S3_KEY S3_SECRET CIPHER_PASS
chown root:postgres /etc/pgbackrest/conf.d/dash-secrets.conf
chmod 640 /etc/pgbackrest/conf.d/dash-secrets.conf

pgbr() { runuser -u postgres -- pgbackrest --stanza=dash "$@"; }

# A freshly minted Linode key can take a few seconds to start working.
for attempt in $(seq 1 12); do
  pgbr info >/dev/null 2>&1 && break
  [ "$attempt" = 12 ] && { pgbr info; exit 1; }
  sleep 5
done
pgbr info

# A cluster skeleton gives us Debian's config dir and unit; its data is
# replaced by the restore. archive_mode=off keeps this copy from ever writing
# WAL into the production repo.
pg_createcluster 18 main >/dev/null
find "$DATA" -mindepth 1 -delete

if [ -n "$TARGET" ]; then
  pgbr restore --type=time --target="$TARGET" --target-action=promote --archive-mode=off
else
  pgbr restore --archive-mode=off
fi

systemctl start postgresql@18-main.service
for _ in $(seq 1 120); do
  [ "$(runuser -u postgres -- psql -XAtc 'select pg_is_in_recovery()' 2>/dev/null)" = f ] && break
  sleep 2
done
[ "$(runuser -u postgres -- psql -XAtc 'select pg_is_in_recovery()')" = f ] ||
  { echo "restored cluster did not finish recovery" >&2; exit 1; }
grep -hE 'starting point-in-time recovery|recovery stopping|selected new timeline|archive recovery complete' \
  /var/log/postgresql/postgresql-18-main.log | sed 's/^/restore: pg: /' || true
echo "restore: cluster 18/main is up and out of recovery"

#!/usr/bin/env bash
# Configures dash-db. Runs as root, started by provision.sh. Safe to re-run.
# Usage: setup.sh <tailnet-ip>, with secrets on stdin as NAME=value lines:
# DB_PASSWORD, CIPHER_PASS, and S3_KEY / S3_SECRET (empty to keep the key
# already on the box).
set -euo pipefail

TAILNET_IP="${1:?tailnet IP}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/files"
PG_VERSION=18
PG_CLUSTER=main
PG_CONF_DIR="/etc/postgresql/${PG_VERSION}/${PG_CLUSTER}"
PG_UNIT="postgresql@${PG_VERSION}-${PG_CLUSTER}.service"
SECRETS=/etc/pgbackrest/conf.d/dash-secrets.conf

DB_PASSWORD="" CIPHER_PASS="" S3_KEY="" S3_SECRET=""
while IFS='=' read -r name value; do
  case "$name" in
    DB_PASSWORD | CIPHER_PASS | S3_KEY | S3_SECRET) printf -v "$name" '%s' "$value" ;;
  esac
done
[[ "$DB_PASSWORD" =~ ^[0-9a-f]{32,}$ ]] || { echo "DB_PASSWORD missing or not hex" >&2; exit 1; }
[ -n "$CIPHER_PASS" ] || { echo "CIPHER_PASS missing" >&2; exit 1; }

# Set when a change needs a Postgres restart (settings or unit).
restart_pg=0
# Installs $1 at $2 with mode $3 and owner $4. Returns 0 only if it changed.
install_file() {
  local src="$1" dst="$2" mode="$3" owner="$4"
  cmp -s "$src" "$dst" && return 1
  install -D -m "$mode" -o "${owner%:*}" -g "${owner#*:}" "$src" "$dst" || exit 1
  echo "updated $dst"
}

# 1. Backup secrets first, so a freshly minted key is never lost. pgBackRest
# reads every file in /etc/pgbackrest/conf.d. archive_command runs as postgres
# (and pg_ctlcluster strips any systemd environment), so the file is owned by
# root and readable by the postgres group only.
install -d -m 755 /etc/pgbackrest /etc/pgbackrest/conf.d
if [ -z "$S3_KEY" ]; then
  S3_KEY="$(sed -n 's/^repo1-s3-key=//p' "$SECRETS" 2>/dev/null || true)"
  S3_SECRET="$(sed -n 's/^repo1-s3-key-secret=//p' "$SECRETS" 2>/dev/null || true)"
fi
[ -n "$S3_KEY" ] && [ -n "$S3_SECRET" ] || { echo "no backup key supplied or on disk" >&2; exit 1; }
secrets_tmp="$(mktemp /etc/pgbackrest/.secrets.XXXXXX)"
chmod 600 "$secrets_tmp"
printf '[global]\nrepo1-s3-key=%s\nrepo1-s3-key-secret=%s\nrepo1-cipher-pass=%s\n' \
  "$S3_KEY" "$S3_SECRET" "$CIPHER_PASS" >"$secrets_tmp"
if cmp -s "$secrets_tmp" "$SECRETS"; then
  rm -f "$secrets_tmp"
else
  mv "$secrets_tmp" "$SECRETS"
  echo "updated $SECRETS"
fi
unset S3_KEY S3_SECRET CIPHER_PASS

# 2. Swap: a 1 GB swapfile on top of Linode's small swap partition.
if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  echo "created /swapfile"
fi
swapon --show=NAME --noheadings | grep -qx /swapfile || swapon /swapfile
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab

# 3. Kernel settings: low swappiness, and let Postgres bind the tailnet IP
# before tailscaled has brought it up at boot.
if install_file "$SRC/sysctl-dash-db.conf" /etc/sysctl.d/60-dash-db.conf 644 root:root; then
  sysctl -q --system
fi

# 4. Packages.
bash "$(dirname "${BASH_SOURCE[0]}")/install-packages.sh"

# 5. Config. The secrets file was written before the postgres group existed.
chown root:postgres "$SECRETS"
chmod 640 "$SECRETS"
rendered="$(mktemp)"
sed "s/@TAILNET_IP@/${TAILNET_IP}/g" "$SRC/postgresql.conf" >"$rendered"
install_file "$rendered" "$PG_CONF_DIR/conf.d/50-dash.conf" 644 postgres:postgres && restart_pg=1
rm -f "$rendered"
install_file "$SRC/systemd/postgresql-override.conf" \
  "/etc/systemd/system/${PG_UNIT}.d/50-dash.conf" 644 root:root && restart_pg=1
reload_pg=0
install_file "$SRC/pg_hba.conf" "$PG_CONF_DIR/pg_hba.conf" 640 postgres:postgres && reload_pg=1
install_file "$SRC/pgbackrest.conf" /etc/pgbackrest/pgbackrest.conf 644 root:root || true
for unit in "$SRC"/systemd/dash-*; do
  install_file "$unit" "/etc/systemd/system/$(basename "$unit")" 644 root:root || true
done

systemctl daemon-reload
systemctl enable -q "$PG_UNIT"
if [ "$restart_pg" = 1 ] || ! systemctl is-active -q "$PG_UNIT"; then
  systemctl restart "$PG_UNIT"
  echo "restarted $PG_UNIT"
elif [ "$reload_pg" = 1 ]; then
  systemctl reload "$PG_UNIT"
  echo "reloaded $PG_UNIT"
fi

# A cluster restored by restore.sh carries archive_mode=off in
# postgresql.auto.conf, which would override conf.d. Clear it.
if [ -n "$(runuser -u postgres -- psql -XAtc "SELECT 1 FROM pg_file_settings WHERE name = 'archive_mode' AND sourcefile LIKE '%postgresql.auto.conf'")" ]; then
  runuser -u postgres -- psql -XAtqc 'ALTER SYSTEM RESET archive_mode'
  systemctl restart "$PG_UNIT"
  echo "cleared archive_mode from postgresql.auto.conf; restarted $PG_UNIT"
fi

# 6. Role and database. The password is hex, so quoting it inline is safe; the
# SQL goes over stdin so it never shows up in ps.
runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 <<SQL
SELECT 'CREATE ROLE mission_control LOGIN'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mission_control') \gexec
ALTER ROLE mission_control WITH LOGIN PASSWORD '${DB_PASSWORD}';
SELECT 'CREATE DATABASE mission_control OWNER mission_control'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'mission_control') \gexec
ALTER DATABASE mission_control OWNER TO mission_control;
REVOKE ALL ON DATABASE mission_control FROM PUBLIC;
SQL
unset DB_PASSWORD

pgbr() { runuser -u postgres -- pgbackrest --stanza=dash "$@"; }

# 7. Backups: stanza, a check that WAL archiving works, and a first full
# backup if the repo has none.
pgbr stanza-create
pgbr check
if [ "$(pgbr info --output=json | python3 -c 'import json,sys; print(len(json.load(sys.stdin)[0]["backup"]))')" = 0 ]; then
  echo "no backups yet; taking the first full backup"
  pgbr --type=full backup
fi

systemctl enable -q --now dash-pgbackrest-full.timer dash-pgbackrest-diff.timer
echo "dash-db: ok"

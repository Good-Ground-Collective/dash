#!/usr/bin/env bash
# Configures dash-db. Runs as root, started by provision.sh. Safe to re-run.
# Usage: setup.sh <tailnet-ip>, with secrets on stdin as NAME=value lines:
# DB_PASSWORD, CIPHER_PASS, S3_KEY / S3_SECRET (empty to keep the key already
# on the box), and PUSHOVER_APP_TOKEN / PUSHOVER_USER_KEY for alerts (empty to
# keep the ones already on the box).
set -euo pipefail

TAILNET_IP="${1:?tailnet IP}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/files"
PG_VERSION=18
PG_CLUSTER=main
PG_CONF_DIR="/etc/postgresql/${PG_VERSION}/${PG_CLUSTER}"
PG_UNIT="postgresql@${PG_VERSION}-${PG_CLUSTER}.service"
SECRETS=/etc/pgbackrest/conf.d/dash-secrets.conf
PUSHOVER=/etc/dash/pushover.env

DB_PASSWORD="" CIPHER_PASS="" S3_KEY="" S3_SECRET="" PUSHOVER_APP_TOKEN="" PUSHOVER_USER_KEY=""
while IFS='=' read -r name value; do
  case "$name" in
    DB_PASSWORD | CIPHER_PASS | S3_KEY | S3_SECRET | PUSHOVER_APP_TOKEN | PUSHOVER_USER_KEY)
      printf -v "$name" '%s' "$value"
      ;;
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

# Secrets first, so a freshly minted key is never lost (README: Secrets).
install -d -m 755 /etc/pgbackrest /etc/pgbackrest/conf.d
on_box_cipher="$(sed -n 's/^repo1-cipher-pass=//p' "$SECRETS" 2>/dev/null || true)"
if [ -n "$on_box_cipher" ] && [ "$on_box_cipher" != "$CIPHER_PASS" ]; then
  echo "the cipher passphrase on this box differs from the one supplied; refusing to replace it" >&2
  exit 1
fi
unset on_box_cipher

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
  if getent group postgres >/dev/null; then
    chown root:postgres "$secrets_tmp"
    chmod 640 "$secrets_tmp"
  fi
  mv "$secrets_tmp" "$SECRETS"
  echo "updated $SECRETS"
fi
unset S3_KEY S3_SECRET CIPHER_PASS

# Pushover credentials for dash-notify. Only root-run units read them.
if [ -z "$PUSHOVER_APP_TOKEN" ] && [ -z "$PUSHOVER_USER_KEY" ] && [ -f "$PUSHOVER" ]; then
  PUSHOVER_APP_TOKEN="$(sed -n 's/^PUSHOVER_APP_TOKEN=//p' "$PUSHOVER")"
  PUSHOVER_USER_KEY="$(sed -n 's/^PUSHOVER_USER_KEY=//p' "$PUSHOVER")"
fi
[[ "$PUSHOVER_APP_TOKEN" =~ ^[A-Za-z0-9]+$ && "$PUSHOVER_USER_KEY" =~ ^[A-Za-z0-9]+$ ]] ||
  { echo "Pushover credentials missing or malformed, and none on the box" >&2; exit 1; }
install -d -m 755 /etc/dash
pushover_tmp="$(mktemp /etc/dash/.pushover.XXXXXX)"
chmod 600 "$pushover_tmp"
printf 'PUSHOVER_APP_TOKEN=%s\nPUSHOVER_USER_KEY=%s\n' "$PUSHOVER_APP_TOKEN" "$PUSHOVER_USER_KEY" >"$pushover_tmp"
if cmp -s "$pushover_tmp" "$PUSHOVER"; then
  rm -f "$pushover_tmp"
else
  # Installed only once Pushover accepts a test message sent with them.
  if ! DASH_PUSHOVER_ENV="$pushover_tmp" bash "$SRC/bin/dash-notify" \
    "Dash backups: alerting enabled on $(hostname -s)" \
    "Test notification: provision.sh installed new Pushover credentials. Backup failures, stale backups and WAL archiving problems on this box now alert here."; then
    rm -f "$pushover_tmp"
    echo "Pushover rejected the new credentials; kept the old ones" >&2
    exit 1
  fi
  mv "$pushover_tmp" "$PUSHOVER"
  echo "updated $PUSHOVER; sent a test notification"
fi
unset PUSHOVER_APP_TOKEN PUSHOVER_USER_KEY

# A 1 GB swapfile on top of Linode's small swap partition.
if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  echo "created /swapfile"
fi
swapon --show=NAME --noheadings | grep -qx /swapfile || swapon /swapfile
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab

if install_file "$SRC/sysctl-dash-db.conf" /etc/sysctl.d/60-dash-db.conf 644 root:root; then
  sysctl -q --system
fi

bash "$(dirname "${BASH_SOURCE[0]}")/install-packages.sh"

# On a fresh box the secrets file predates the postgres group.
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
install_file "$SRC/bin/dash-notify" /usr/local/bin/dash-notify 755 root:root || true
install_file "$SRC/bin/dash-backup-alerts" /usr/local/sbin/dash-backup-alerts 755 root:root || true
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

# A restored cluster's postgresql.auto.conf has archive_mode=off.
if [ -n "$(runuser -u postgres -- psql -XAtc "SELECT 1 FROM pg_file_settings WHERE name = 'archive_mode' AND sourcefile LIKE '%postgresql.auto.conf'")" ]; then
  runuser -u postgres -- psql -XAtqc 'ALTER SYSTEM RESET archive_mode'
  systemctl restart "$PG_UNIT"
  echo "cleared archive_mode from postgresql.auto.conf; restarted $PG_UNIT"
fi

# The password is hex, so inlining it is safe; stdin keeps it out of ps.
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

pgbr stanza-create
pgbr check
if [ "$(pgbr info --output=json | python3 -c 'import json,sys; print(len(json.load(sys.stdin)[0]["backup"]))')" = 0 ]; then
  echo "no backups yet; taking the first full backup"
  pgbr --type=full backup
fi

systemctl enable -q --now dash-pgbackrest-full.timer dash-pgbackrest-diff.timer \
  dash-backup-age.timer dash-archive-check.timer
echo "dash-db: ok"

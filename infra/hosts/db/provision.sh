#!/usr/bin/env bash
# Provisions Postgres 18 and pgBackRest on dash-db. Run from an admin machine
# on the tailnet. Safe to re-run. See README.md.
#
# Local step: makes sure the dash-pg-backups bucket and its key exist in
# Linode Object Storage (S3-compatible, not AWS), and that the database
# password and backup cipher passphrase are in ~/.config/dash/infra.env.
# Remote step: copies remote/ and files/ to dash-db and runs remote/setup.sh.
set -euo pipefail

# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

DB_HOST="${DASH_DB_HOST:-dash-db}"

need_tools curl jq openssl ssh tar awk
load_linode_token
ensure_env_file

# Bucket.
if linode_api GET "/object-storage/buckets/${REGION}/${BUCKET}" >/dev/null 2>&1; then
  echo "bucket ${BUCKET}: exists"
else
  linode_api POST /object-storage/buckets \
    --data "$(jq -nc --arg l "$BUCKET" --arg r "$REGION" '{label: $l, region: $r, acl: "private"}')" >/dev/null
  echo "bucket ${BUCKET}: created"
fi

# Database password and cipher passphrase. infra.env is the source of truth;
# both are generated once and re-applied on every run.
db_url="$(env_get DASH_DATABASE_URL)"
if [ -n "$db_url" ]; then
  db_password="$(sed -E 's#^postgres://[^:]+:([^@]+)@.*#\1#' <<<"$db_url")"
else
  db_password="$(random_secret)"
fi
cipher_pass="$(env_get DASH_PGBACKREST_CIPHER_PASS)"
if [ -z "$cipher_pass" ]; then
  if remote "$DB_HOST" 'sudo test -e /etc/pgbackrest/conf.d/dash-secrets.conf'; then
    die "dash-db already has a backup config but ${ENV_FILE} has no DASH_PGBACKREST_CIPHER_PASS. Copy repo1-cipher-pass back from /etc/pgbackrest/conf.d/dash-secrets.conf before re-running."
  fi
  cipher_pass="$(random_secret)"
  env_set DASH_PGBACKREST_CIPHER_PASS "$cipher_pass"
  echo "infra.env: wrote DASH_PGBACKREST_CIPHER_PASS"
fi

# Backup key. Its secret lives only on dash-db, so a fresh one is minted
# whenever Linode has no key with this label (first run, or after the old key
# was revoked, e.g. following a restore onto a new box).
key_id="$(key_id_by_label "$KEY_LABEL")"
s3_key=""
s3_secret=""
if [ -n "$key_id" ]; then
  remote "$DB_HOST" 'sudo grep -qs "^repo1-s3-key-secret=." /etc/pgbackrest/conf.d/dash-secrets.conf' ||
    die "key ${KEY_LABEL} (id ${key_id}) exists but ${DB_HOST} does not hold its secret. Revoke it in Linode and re-run; a secret cannot be read back."
  echo "key ${KEY_LABEL}: exists (id ${key_id}), already on ${DB_HOST}"
else
  key_json="$(create_bucket_key "$KEY_LABEL" read_write)"
  s3_key="$(jq -r .access_key <<<"$key_json")"
  s3_secret="$(jq -r .secret_key <<<"$key_json")"
  echo "key ${KEY_LABEL}: created (id $(jq -r .id <<<"$key_json"))"
  unset key_json
fi

tailnet_ip="$(remote "$DB_HOST" 'tailscale ip -4')"
[[ "$tailnet_ip" =~ ^100\.[0-9.]+$ ]] || die "unexpected tailnet IP from ${DB_HOST}: ${tailnet_ip}"

# Written before the remote run so a generated password is never lost.
env_set DASH_DATABASE_URL "postgres://mission_control:${db_password}@${tailnet_ip}:5432/mission_control"
echo "infra.env: DASH_DATABASE_URL set"

bundle="$(push_bundle "$DB_HOST")"
trap 'remote "$DB_HOST" "rm -rf $bundle" || true' EXIT

# Secrets go over stdin, never argv.
printf 'DB_PASSWORD=%s\nCIPHER_PASS=%s\nS3_KEY=%s\nS3_SECRET=%s\n' \
  "$db_password" "$cipher_pass" "$s3_key" "$s3_secret" |
  remote "$DB_HOST" "sudo bash '$bundle/remote/setup.sh' '$tailnet_ip'"
echo "done"

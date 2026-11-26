#!/usr/bin/env bash
# Creates the dash-tfstate bucket and its key; see README.md. Needs LINODE_TOKEN.
set -euo pipefail

REGION="us-southeast"
S3_REGION="us-southeast-1"
BUCKET="dash-tfstate"
KEY_LABEL="dash-tfstate"
ENV_FILE="${DASH_INFRA_ENV:-$HOME/.config/dash/infra.env}"
API="https://api.linode.com/v4"

: "${LINODE_TOKEN:?set LINODE_TOKEN to a Linode API token with Object Storage read/write}"
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

api() {
  local method="$1" path="$2"
  shift 2
  printf 'header = "Authorization: Bearer %s"\n' "$LINODE_TOKEN" |
    curl -sS -K - -X "$method" -H "Content-Type: application/json" "$API$path" "$@"
}

bucket_status="$(api GET "/object-storage/buckets/${REGION}/${BUCKET}" -o /dev/null -w '%{http_code}')"
if [ "$bucket_status" = 200 ]; then
  echo "bucket ${BUCKET}: exists"
elif [ "$bucket_status" != 404 ]; then
  echo "checking bucket ${BUCKET} failed with HTTP ${bucket_status}" >&2
  exit 1
else
  api POST /object-storage/buckets --fail-with-body \
    --data "$(jq -nc --arg l "$BUCKET" --arg r "$REGION" '{label: $l, region: $r, acl: "private"}')" >/dev/null
  echo "bucket ${BUCKET}: created"
fi

env_dir="$(dirname "$ENV_FILE")"
[ -d "$env_dir" ] || {
  mkdir -p "$env_dir"
  chmod 700 "$env_dir"
}
touch "$ENV_FILE"
chmod 600 "$ENV_FILE"

existing_key_id="$(api GET "/object-storage/keys?page_size=500" --fail-with-body |
  jq -r --arg l "$KEY_LABEL" '[.data[] | select(.label == $l)][0].id // empty')"

if grep -q '^LINODE_OBJ_SECRET_KEY=' "$ENV_FILE"; then
  [ -n "$existing_key_id" ] || {
    echo "${ENV_FILE} has a state key but Linode has no key labelled ${KEY_LABEL}" >&2
    exit 1
  }
  echo "key ${KEY_LABEL}: exists (id ${existing_key_id})"
else
  [ -z "$existing_key_id" ] || {
    echo "key ${KEY_LABEL} exists (id ${existing_key_id}) but its secret is not in ${ENV_FILE}." >&2
    echo "Revoke it in Linode and re-run; its secret cannot be read back." >&2
    exit 1
  }
  key_json="$(api POST /object-storage/keys --fail-with-body --data "$(jq -nc \
    --arg l "$KEY_LABEL" --arg r "$REGION" --arg b "$BUCKET" \
    '{label: $l, bucket_access: [{region: $r, bucket_name: $b, permissions: "read_write"}]}')")"
  access_key="$(jq -er .access_key <<<"$key_json")"
  secret_key="$(jq -er .secret_key <<<"$key_json")"
  key_id="$(jq -er .id <<<"$key_json")"
  unset key_json
  {
    echo "LINODE_OBJ_ACCESS_KEY=${access_key}"
    echo "LINODE_OBJ_SECRET_KEY=${secret_key}"
  } >>"$ENV_FILE"
  echo "key ${KEY_LABEL}: created (id ${key_id})"
fi

grep -q '^TF_VAR_tailscale_auth_key=' "$ENV_FILE" ||
  echo "TF_VAR_tailscale_auth_key=tskey-auth-REPLACE-ME" >>"$ENV_FILE"

access_key="$(sed -n 's/^LINODE_OBJ_ACCESS_KEY=//p' "$ENV_FILE")"
secret_key="$(sed -n 's/^LINODE_OBJ_SECRET_KEY=//p' "$ENV_FILE")"
body='<VersioningConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Status>Enabled</Status></VersioningConfiguration>'
s3_url="https://${BUCKET}.${S3_REGION}.linodeobjects.com/?versioning"
s3() {
  printf 'user = "%s:%s"\n' "$access_key" "$secret_key" |
    curl -sS --fail-with-body -K - --aws-sigv4 "aws:amz:${S3_REGION}:s3" "$@"
}

for attempt in 1 2 3 4 5 6; do
  if s3 -o /dev/null -X PUT \
    -H "Content-MD5: $(printf '%s' "$body" | openssl dgst -md5 -binary | base64)" \
    -H "x-amz-content-sha256: $(printf '%s' "$body" | openssl dgst -sha256 | awk '{print $NF}')" \
    --data "$body" "$s3_url"; then
    break
  fi
  [ "$attempt" -lt 6 ] || { echo "could not enable versioning on ${BUCKET}" >&2; exit 1; }
  sleep 10
done

status="$(s3 -H "x-amz-content-sha256: $(printf '' | openssl dgst -sha256 | awk '{print $NF}')" \
  "$s3_url" | sed -n 's:.*<Status>\(.*\)</Status>.*:\1:p')"
[ "$status" = Enabled ] || {
  echo "bucket ${BUCKET}: versioning is '${status:-unknown}', expected Enabled" >&2
  exit 1
}
echo "bucket ${BUCKET}: versioning Enabled"
echo "secrets: ${ENV_FILE}"

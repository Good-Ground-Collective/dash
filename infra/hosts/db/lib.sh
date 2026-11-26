# Shared helpers for provision.sh and restore-test.sh. Sourced, not run.
# Linode Object Storage is reached through Linode's own API and its
# S3-compatible endpoint. No AWS account is involved.
# shellcheck shell=bash disable=SC2034

REGION="us-southeast"
BUCKET="dash-pg-backups"
KEY_LABEL="dash-pg-backups"
ENV_FILE="${DASH_INFRA_ENV:-$HOME/.config/dash/infra.env}"
LINODE_API="https://api.linode.com/v4"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() {
  echo "error: $*" >&2
  exit 1
}

need_tools() {
  local t
  for t in "$@"; do command -v "$t" >/dev/null || die "$t is required"; done
}

load_linode_token() {
  if [ -z "${LINODE_TOKEN:-}" ] && [ -z "${LINODE_API_KEY:-}" ] && [ -f "$HOME/.zsh/secrets" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$HOME/.zsh/secrets"
    set +a
  fi
  LINODE_TOKEN="${LINODE_TOKEN:-${LINODE_API_KEY:-}}"
  [ -n "$LINODE_TOKEN" ] || die "set LINODE_TOKEN or LINODE_API_KEY (Object Storage read/write)"
}

# Pushover credentials for dash-db's alerts, from the env or ~/.zsh/secrets.
load_pushover_creds() {
  if { [ -z "${PUSHOVER_APP_TOKEN:-}" ] || [ -z "${PUSHOVER_USER_KEY:-}" ]; } && [ -f "$HOME/.zsh/secrets" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$HOME/.zsh/secrets"
    set +a
  fi
  [ -n "${PUSHOVER_APP_TOKEN:-}" ] && [ -n "${PUSHOVER_USER_KEY:-}" ] ||
    die "set PUSHOVER_APP_TOKEN and PUSHOVER_USER_KEY (backup alerts)"
}

# The token goes to curl through a file descriptor, not argv.
linode_api() {
  local method="$1" path="$2"
  shift 2
  curl -sS --fail-with-body -X "$method" \
    -H @<(printf 'Authorization: Bearer %s\n' "$LINODE_TOKEN") \
    -H "Content-Type: application/json" \
    "$LINODE_API$path" "$@"
}

# Prints the first Object Storage key with this label as JSON, or null.
key_by_label() {
  linode_api GET "/object-storage/keys?page_size=500" |
    jq -c --arg l "$1" '[.data[] | select(.label == $l)][0]'
}

# Creates a key limited to $BUCKET. Prints the API's JSON (holds the secret).
create_bucket_key() {
  local label="$1" perms="$2"
  linode_api POST /object-storage/keys --data "$(jq -nc \
    --arg l "$label" --arg r "$REGION" --arg b "$BUCKET" --arg p "$perms" \
    '{label: $l, bucket_access: [{region: $r, bucket_name: $b, permissions: $p}]}')"
}

ensure_env_file() {
  mkdir -p "$(dirname "$ENV_FILE")"
  chmod 700 "$(dirname "$ENV_FILE")"
  touch "$ENV_FILE"
  chmod 600 "$ENV_FILE"
}

env_get() {
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1
}

# Replaces NAME=... in place, or appends it. The value never hits argv of
# another process: it goes through awk's environment.
env_set() {
  local name="$1" tmp
  tmp="$(mktemp "${ENV_FILE}.XXXXXX")"
  chmod 600 "$tmp"
  ENV_NAME="$name" ENV_VALUE="$2" awk '
    BEGIN { n = ENVIRON["ENV_NAME"]; v = ENVIRON["ENV_VALUE"]; done = 0 }
    index($0, n "=") == 1 { if (!done) print n "=" v; done = 1; next }
    { print }
    END { if (!done) print n "=" v }
  ' "$ENV_FILE" >"$tmp"
  mv "$tmp" "$ENV_FILE"
}

random_secret() {
  openssl rand -hex 32
}

remote() {
  local host="$1"
  shift
  ssh -o BatchMode=yes -o ConnectTimeout=15 "dash@${host}" "$@"
}

# Copies remote/ and files/ to a fresh temp dir on the host; prints its path.
push_bundle() {
  local host="$1" dir
  dir="$(remote "$host" 'mktemp -d /tmp/dash-db.XXXXXX' </dev/null)"
  COPYFILE_DISABLE=1 tar -C "$HERE" -cf - remote files |
    remote "$host" "tar --warning=no-unknown-keyword -C '$dir' -xf -"
  echo "$dir"
}

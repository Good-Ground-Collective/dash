#!/usr/bin/env bash
# Runs tofu with Dash's credentials loaded. Usage: ./tofu.sh plan
# State goes to Linode Object Storage through its S3-compatible API; no AWS
# account is involved. The backend only reads its keys from AWS_* names.
set -euo pipefail

ENV_FILE="${DASH_INFRA_ENV:-$HOME/.config/dash/infra.env}"
SECRETS_FILE="${DASH_SECRETS:-$HOME/.zsh/secrets}"

[ -r "$ENV_FILE" ] || { echo "missing ${ENV_FILE}; run ./bootstrap.sh first" >&2; exit 1; }

set -a
if [ -r "$SECRETS_FILE" ]; then
  # shellcheck disable=SC1090
  . "$SECRETS_FILE" >/dev/null 2>&1
fi
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${LINODE_OBJ_ACCESS_KEY:?missing from ${ENV_FILE}}"
: "${LINODE_OBJ_SECRET_KEY:?missing from ${ENV_FILE}}"

export AWS_ACCESS_KEY_ID="$LINODE_OBJ_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$LINODE_OBJ_SECRET_KEY"
unset AWS_PROFILE AWS_SESSION_TOKEN AWS_DEFAULT_PROFILE

export LINODE_TOKEN="${LINODE_TOKEN:-${LINODE_API_KEY:?set LINODE_TOKEN or LINODE_API_KEY}}"
export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-${CLOUDFLARE_API_KEY:?set CLOUDFLARE_API_TOKEN or CLOUDFLARE_API_KEY}}"
unset CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL

cd "$(dirname "$0")"
exec tofu "$@"

#!/bin/sh
root=${CLAUDE_PLUGIN_ROOT:-}
data=${CLAUDE_PLUGIN_DATA:-}
if [ -z "$root" ] || [ -z "$data" ]; then
  exit 0
fi

install_pinned() {
  if cmp -s "$root/package.json" "$data/package.json"; then
    return 0
  fi
  mkdir -p "$data" || return 0
  find "$data" -maxdepth 1 -name install.lock -mmin +10 -exec rmdir {} \; 2>/dev/null
  mkdir "$data/install.lock" 2>/dev/null || return 0
  if ! cp "$root/package.json" "$root/.npmrc" "$data/" ||
    ! npm install --prefix "$data" --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error >"$data/install.log" 2>&1; then
    rm -f "$data/package.json"
  fi
  rmdir "$data/install.lock"
}

if [ "${1:-}" = session-start ]; then
  install_pinned
fi

bin="$data/node_modules/.bin/dash-hooks"
if [ -x "$bin" ]; then
  "$bin" "$@"
fi
exit 0

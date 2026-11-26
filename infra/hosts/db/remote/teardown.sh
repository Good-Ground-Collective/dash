#!/usr/bin/env bash
# Removes a restore-test cluster and everything restore.sh installed: Postgres,
# pgBackRest, the PGDG repo, their config, data and logs. Runs as root on the
# scratch box, and only if restore-test.sh marked it with /etc/dash-restore-scratch.
set -euo pipefail

if [ "$(hostname)" = dash-db ] || [ ! -e /etc/dash-restore-scratch ]; then
  echo "refusing: this box is not marked as a restore-test scratch box" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
if command -v pg_dropcluster >/dev/null && [ -d /etc/postgresql/18/main ]; then
  pg_dropcluster 18 main --stop
fi
mapfile -t pkgs < <(dpkg-query -W -f '${Package}\n' 'postgresql*' 'pgbackrest' 'libpq5' 2>/dev/null || true)
installed=()
for p in "${pkgs[@]}"; do
  dpkg -s "$p" 2>/dev/null | grep -q '^Status: install ok installed' && installed+=("$p")
done
if [ "${#installed[@]}" -gt 0 ]; then
  apt-get purge -y -q "${installed[@]}"
fi
apt-get autoremove --purge -y -q
rm -f /etc/apt/sources.list.d/pgdg.list /etc/apt/sources.list.d/pgdg.sources \
  /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg
rm -rf /etc/pgbackrest /etc/pgbackrest.conf /etc/postgresql /etc/postgresql-common \
  /var/lib/postgresql /var/log/postgresql /var/log/pgbackrest /var/spool/pgbackrest \
  /tmp/pgbackrest /run/postgresql
if id postgres >/dev/null 2>&1; then
  deluser --quiet postgres
fi
apt-get update -q >/dev/null
rm -f /etc/dash-restore-scratch
echo "teardown: done"

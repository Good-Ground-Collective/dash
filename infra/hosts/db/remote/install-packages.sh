#!/usr/bin/env bash
# Installs Postgres 18 and pgBackRest from the PGDG apt repo. Runs as root on
# the target box. Safe to re-run. Pass --no-main-cluster to stop the package
# from creating the default 18/main cluster (used by the restore test).
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

if [ "${1:-}" = "--no-main-cluster" ]; then
  mkdir -p /etc/postgresql-common/createcluster.d
  echo "create_main_cluster = false" >/etc/postgresql-common/createcluster.d/50-no-main.conf
fi

if [ ! -f /etc/apt/sources.list.d/pgdg.list ] && [ ! -f /etc/apt/sources.list.d/pgdg.sources ]; then
  apt-get update -q
  apt-get install -y -q postgresql-common ca-certificates curl
  /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
fi

if ! dpkg -s postgresql-18 pgbackrest >/dev/null 2>&1; then
  apt-get update -q
  apt-get install -y -q postgresql-18 pgbackrest
fi

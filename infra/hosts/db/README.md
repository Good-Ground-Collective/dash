# dash-db: Postgres 18 and backups

Scripts and config for Dash's production database host, `dash-db`. Issue #42 has the decisions behind it; `infra/tofu` creates the box itself.

`dash-db` is a 1 GB Nanode running Ubuntu 24.04. It has no public inbound traffic: the cloud firewall drops everything except Tailscale, and Mission Control on `dash-app` reaches Postgres over the tailnet.

## What `provision.sh` sets up

Run from an admin machine on the tailnet. It works in two steps.

On the machine you run it from, it:

- creates the `dash-pg-backups` bucket in Linode Object Storage (S3-compatible) in `us-southeast`, if it is missing
- creates an access key labelled `dash-pg-backups` with read_write on that bucket only, if Linode has no key with that label, and sends its secret straight to `dash-db`
- generates the app password and the backup cipher passphrase on first run, and keeps both in `~/.config/dash/infra.env`

On `dash-db`, it:

- adds a 1 GB `/swapfile` on top of Linode's 512 MB swap partition, and sets `vm.swappiness = 10`
- installs Postgres 18 and pgBackRest from the PGDG apt repo
- writes `files/postgresql.conf` to `/etc/postgresql/18/main/conf.d/50-dash.conf`:
  - `listen_addresses = 'localhost,<tailnet IP>'`
  - `shared_buffers = 256MB`, `effective_cache_size = 640MB`, `work_mem = 4MB`, `maintenance_work_mem = 64MB`
  - `max_connections = 50`
  - WAL archiving through pgBackRest, with `archive_timeout = 900`
- replaces `pg_hba.conf` with `files/pg_hba.conf`: peer auth on the local socket, and TLS-only (`hostssl`) scram-sha-256 from `100.64.0.0/10` for the `mission_control` role and database only
- sets `net.ipv4.ip_nonlocal_bind = 1` and orders Postgres after `tailscaled`, so Postgres binds the tailnet IP at boot even if Tailscale is not up yet
- creates the `mission_control` role and the `mission_control` database it owns, revokes `PUBLIC` access to that database, and sets the role's password from `infra.env` on every run
- creates the pgBackRest stanza `dash`, checks that WAL archiving works, and takes a first full backup if the repo has none
- installs and enables the backup timers

Mission Control's DBOS keeps its own schema in the same database, so nothing extra is needed for it.

Re-running is safe. Files are only rewritten when they differ. Postgres restarts only when its settings or unit drop-in change, and reloads when `pg_hba.conf` changes. Re-running also resets the app password to the one in `infra.env`.

## Running it

```sh
infra/hosts/db/provision.sh
```

It needs SSH as `dash` to `dash-db` over the tailnet, plus `curl`, `jq` and `openssl`. It reads a Linode API token with Object Storage read/write from `LINODE_TOKEN` or `LINODE_API_KEY`, falling back to `~/.zsh/secrets`. Set `DASH_DB_HOST` to point it at another host, and `DASH_INFRA_ENV` to use another env file.

## Secrets

Nothing secret is in this directory. Secrets travel to the box over SSH stdin, never as command arguments, and the Linode token reaches `curl` through a file descriptor. If `dash-db` already holds a different cipher passphrase than `infra.env`, `setup.sh` refuses to replace it.

| Secret                         | Where it lives                                                         |
| ------------------------------ | ---------------------------------------------------------------------- |
| `DASH_DATABASE_URL`            | `~/.config/dash/infra.env` (mode 600). The full app connection string. |
| `DASH_PGBACKREST_CIPHER_PASS`  | `~/.config/dash/infra.env`, and on `dash-db` in the file below.        |
| Backup bucket key (read_write) | Only on `dash-db`, in `/etc/pgbackrest/conf.d/dash-secrets.conf`.      |
| Linode API token               | Your shell or `~/.zsh/secrets`. Not needed on any box.                 |

`DASH_DATABASE_URL` points at `dash-db`'s tailnet IP, `100.117.180.120`, not the MagicDNS name, because MagicDNS may not resolve inside a Docker container on `dash-app`.

`/etc/pgbackrest/conf.d/dash-secrets.conf` is owned by root and readable by the `postgres` group only (mode 640). It cannot be root-only: `archive_command` runs as `postgres`, and Debian's `pg_ctlcluster` drops any environment systemd would pass in.

**Keep `DASH_PGBACKREST_CIPHER_PASS` safe off the box.** The backups are encrypted with it. If `dash-db` is lost, the copy in `~/.config/dash/infra.env` is the only way to read them. Without it, the backups are useless. Put it in your password manager too.

The bucket key has no copy off the box, and doesn't need one. A restore mints a fresh read-only key through the Linode API (see below).

## Backups

pgBackRest writes to Linode Object Storage (S3-compatible) at `https://us-southeast-1.linodeobjects.com`, bucket `dash-pg-backups`, path `/dash-db`. pgBackRest calls this repo type `s3`. No AWS account is involved. The repo is encrypted (`aes-256-cbc`) and compressed with zstd.

- **WAL:** every finished WAL segment is pushed by `archive_command`. On a quiet database, `archive_timeout` forces a segment out at least every 15 minutes, which bounds data loss.
- **Full:** Sundays at 03:00 UTC, from `dash-pgbackrest-full.timer`.
- **Differential:** Monday to Saturday at 03:00 UTC, from `dash-pgbackrest-diff.timer`. If no full backup exists, pgBackRest takes a full one instead.
- **Retention:** 4 full backups. Older fulls, the differentials that depend on them, and their WAL are expired after each backup.

Both timers start `dash-pgbackrest@<type>.service`. It runs `pgbackrest check` first, which fails if WAL archiving is broken, so a quiet archive failure surfaces within a day. If any step fails, `OnFailure=` starts `dash-pgbackrest-failed@.service`, which writes an error to the journal under the tag `dash-backup`.

```sh
# on dash-db
systemctl list-timers 'dash-*'
sudo -u postgres pgbackrest --stanza=dash info
journalctl -t dash-backup                       # failures only
journalctl -u 'dash-pgbackrest@*'               # every run
sudo systemctl start dash-pgbackrest@diff.service   # back up now
```

`pgbackrest` reads its settings from `/etc/pgbackrest/pgbackrest.conf` and `conf.d/`, so it must run as `postgres`.

## Restore runbook

`remote/restore.sh` restores the `dash` stanza onto a box as cluster `18/main` and starts it. It installs Postgres 18 and pgBackRest if needed and refuses to touch an existing `18/main` cluster. It sets `archive_mode=off` on the restored copy, so that copy never writes into the production repo. It takes a target time for a point-in-time restore. With no target, it replays to the end of the archive.

### `dash-db` is lost

1. Recreate the box with OpenTofu.
2. In Linode Object Storage, revoke the `dash-pg-backups` key. Its secret died with the old box.
3. From the repo root, in bash, mint a read-only key and restore. The latest point in the archive is the default; pass a time as the argument to `restore.sh` for point in time.

   ```bash
   . infra/hosts/db/lib.sh
   load_linode_token
   key_json="$(create_bucket_key dash-pg-restore-manual read_only)"
   bundle="$(push_bundle dash-db)"
   printf 'S3_KEY=%s\nS3_SECRET=%s\nCIPHER_PASS=%s\n' \
     "$(jq -r .access_key <<<"$key_json")" "$(jq -r .secret_key <<<"$key_json")" \
     "$(env_get DASH_PGBACKREST_CIPHER_PASS)" |
     remote dash-db "sudo bash $bundle/remote/restore.sh"
   ```

4. Run `provision.sh`. Linode no longer has a `dash-pg-backups` key, so it mints a new read_write one and replaces the read-only key on the box. It also applies the Dash settings, clears the restore's `archive_mode=off`, and resets the app password. It does not take a new full backup automatically, because the repo already has older ones. Start one with `sudo systemctl start dash-pgbackrest@full.service`.
5. Revoke the `dash-pg-restore-manual` key.

The tailnet IP changes when the box is recreated, so update `DASH_DATABASE_URL` and the app's secret. `provision.sh` rewrites the line in `infra.env`.

### Recover from a bad change (point in time)

Restore onto `dash-spare` at a time just before the change, check the data there, then copy what you need back with `pg_dump` or swap the app over. Don't restore over the live cluster on `dash-db`.

## Restore test

`restore-test.sh` proves the backups restore, using only what a real recovery has: the cipher passphrase from `infra.env` and a Linode API token.

```sh
infra/hosts/db/restore-test.sh            # scratch host defaults to dash-spare
```

It:

1. On `dash-db`, writes 100 rows to a scratch table `dash_restore_check` in the `postgres` database.
2. Takes a differential backup through the real `dash-pgbackrest@diff.service`.
3. Writes 50 more rows and notes the time.
4. Writes 25 rows that must not survive the restore.
5. Runs `pgbackrest check`, which forces the WAL out to the repo.
6. Mints a read-only key labelled `dash-pg-restore-<run>`, scoped to the bucket.
7. On `dash-spare`, runs `remote/restore.sh` with the noted time as a point-in-time target, and counts the rows.
8. Tears everything down, even if a step failed: `remote/teardown.sh` drops the cluster and purges Postgres, pgBackRest, the PGDG repo, the `postgres` user and their files from `dash-spare`. It then revokes the key and drops the scratch table on `dash-db`.

It exits non-zero unless the restored counts are exactly 100 and 50, with no rows from step 4. Before it touches anything, it refuses to run if the scratch host already has Postgres, a `postgres` user or `/var/lib/postgresql`. It marks the host with `/etc/dash-restore-scratch`, and `teardown.sh` refuses to run on a host without that mark.

### Result, 2026-11-26

Run `20261126T184210Z`: **PASS.** Later runs `20261126T184700Z` and `20261126T191858Z` (after the review fixes) passed with the same counts.

```text
target time: 2026-11-26 18:42:19.511938+00
source counts:    after-backup|50  after-target|25  before-backup|100
restore command end: completed successfully (15677ms)
LOG:  starting point-in-time recovery to 2026-11-26 18:42:19.511938+00
LOG:  recovery stopping before commit of transaction 776, time 2026-11-26 18:42:22.182515+00
LOG:  selected new timeline ID: 2
LOG:  archive recovery complete
restored counts:  after-backup=50  before-backup=100
RESULT: PASS
teardown: done
revoked key dash-pg-restore-20261126T184210Z
dropped dash_restore_check on dash-db
```

Afterwards, `dash-spare`'s installed package list was identical to a snapshot taken before the test. It had no `postgres` user, no PGDG source and no Postgres or pgBackRest directories.

Other checks the same day:

- **App path.** A throwaway `psql` unpacked in `/tmp` on `dash-app` (since removed) connected with `DASH_DATABASE_URL`. It saw `current_user = mission_control`, server `100.117.180.120` and client `100.107.66.72`, over TLS, on PostgreSQL 18.7. Connecting as `postgres` from `dash-app` was refused with `no pg_hba.conf entry`. So was `mission_control` with `sslmode=disable`.
- **Reboot.** After `dash-db` rebooted, Postgres was listening on `100.117.180.120:5432` and localhost, both swap devices were active, the timers were scheduled, and `pgbackrest check` passed.
- **Cipher guard.** `provision.sh` with a wrong `DASH_PGBACKREST_CIPHER_PASS` stopped with "refusing to replace it", and archiving kept working.
- **Failure hook.** A deliberately failing `dash-pgbackrest@bogus.service` logged `dash-db backup FAILED: dash-pgbackrest@bogus.service` under `dash-backup`.

Run the test again after any change to the backup setup, and every few months anyway.

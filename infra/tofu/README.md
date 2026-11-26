# Dash infrastructure

OpenTofu for Dash's production hosts in Linode's Atlanta region (`us-southeast`) and the two Dash records in Cloudflare. Issue #42 has the decisions behind it.

## What it manages

| Resource                        | What                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `linode_instance.host["app"]`   | `dash-app`, Linode 2 GB, Ubuntu 24.04. Runs web and Mission Control.                |
| `linode_instance.host["db"]`    | `dash-db`, Nanode, Ubuntu 24.04. Postgres 18 lands in a later PR.                   |
| `linode_instance.host["spare"]` | `dash-spare`, Nanode, Ubuntu 24.04. Base config only.                               |
| `linode_firewall.public`        | Attached to `dash-app`. Inbound TCP 80 and 443, UDP 41641; everything else dropped. |
| `linode_firewall.private`       | Attached to `dash-db` and `dash-spare`. Inbound UDP 41641 only.                     |
| `cloudflare_dns_record.app`     | A and AAAA for `dash.doublel.studio` and `api.dash.doublel.studio`, DNS-only.       |

Nothing else in the `doublel.studio` zone is managed here. Atlanta has no Linode VPCs and its 192.168 private network is shared with other customers, so the boxes talk to each other over Tailscale. SSH is only reachable over the tailnet.

Each box boots from `templates/host.yaml.tftpl` through Linode metadata. Cloud-init creates the `dash` sudo user with the keys in `admin_ssh_public_keys`, turns off root and password SSH, enables unattended security upgrades, then installs Tailscale and joins the tailnet as `tag:dash`. It runs once, at first boot. Later edits to the template do not touch running boxes.

## Secrets

Nothing secret lives in this directory.

| Variable                                     | Used for                                                | Where it lives             |
| -------------------------------------------- | ------------------------------------------------------- | -------------------------- |
| `LINODE_TOKEN`                               | Linode provider, `bootstrap.sh`                         | Your shell                 |
| `CLOUDFLARE_API_TOKEN`                       | Cloudflare provider; needs DNS edit on `doublel.studio` | Your shell                 |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | State bucket, written by `bootstrap.sh`                 | `~/.config/dash/infra.env` |
| `TF_VAR_tailscale_auth_key`                  | Tailscale join at first boot                            | `~/.config/dash/infra.env` |

The Tailscale key is written into each box's user data, so it also ends up in the Linode metadata service and in OpenTofu state. Keep it pre-authorized, tagged `tag:dash` and short-lived (a day is plenty). After the first apply it is only needed again when a box is created or replaced, so any value satisfies the variable in between.

## Bootstrap order

1. `./bootstrap.sh` creates the `dash-tfstate` bucket with versioning, plus an access key limited to that bucket, and writes the key to `~/.config/dash/infra.env` (mode 600). It is safe to re-run. If the key exists in Linode but not in the env file, revoke it and run the script again.
2. Create the Tailscale auth key and put it in `~/.config/dash/infra.env` as `TF_VAR_tailscale_auth_key`.
3. Plan and apply as below.
4. Delete `imports.tf` once the first apply has succeeded. It maps the three old DoubleL boxes onto their successors so the first plan replaces them.

## Plan and apply

```sh
set -a
. ~/.config/dash/infra.env
set +a
export LINODE_TOKEN=... CLOUDFLARE_API_TOKEN=...

tofu init
tofu plan -out=dash.tfplan
tofu apply dash.tfplan
```

State is locked with a lock file in the bucket (`use_lockfile`). CI runs `tofu fmt -check` and `tofu validate` only; plans and applies run by hand.

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

Each box boots from `templates/host.yaml.tftpl` through Linode metadata. Cloud-init creates the `dash` sudo user with the keys in `admin_ssh_public_keys`, turns off root and password SSH, enables unattended security upgrades, then installs Tailscale and joins the tailnet as `tag:dash`. It runs once, at first boot. Later edits to the template or to `admin_ssh_public_keys` do not touch or replace running boxes; add keys to a running box over the tailnet.

The Linode provider refuses to create a box from an image unless it has `authorized_keys`, `root_pass` or `authorized_users`, so the same keys are also passed as `authorized_keys`. Linode puts them on root, but root SSH is off and port 22 is closed publicly, so they only matter for Linode's recovery tooling.

## Secrets

Nothing secret lives in this directory. `tofu.sh` loads the files below and runs `tofu` with them, so the values never need to be in your interactive shell.

| Variable                                         | Used for                                                | Where it lives                 |
| ------------------------------------------------ | ------------------------------------------------------- | ------------------------------ |
| `LINODE_TOKEN` (or `LINODE_API_KEY`)             | Linode provider, `bootstrap.sh`                         | Your shell or `~/.zsh/secrets` |
| `CLOUDFLARE_API_TOKEN` (or `CLOUDFLARE_API_KEY`) | Cloudflare provider; needs DNS edit on `doublel.studio` | Your shell or `~/.zsh/secrets` |
| `LINODE_OBJ_ACCESS_KEY`, `LINODE_OBJ_SECRET_KEY` | State bucket key, written by `bootstrap.sh`             | `~/.config/dash/infra.env`     |
| `TF_VAR_tailscale_auth_key`                      | Tailscale join at first boot                            | `~/.config/dash/infra.env`     |

The Tailscale key is written into each box's user data, so it also ends up in the Linode metadata service and in OpenTofu state. Keep it pre-authorized, tagged `tag:dash` and short-lived (a day is plenty). After the first apply it is only needed again when a box is created or replaced, so any value satisfies the variable in between.

## Bootstrap order

1. `LINODE_TOKEN=... ./bootstrap.sh` creates the `dash-tfstate` bucket with versioning, plus an access key limited to that bucket, and writes the key to `~/.config/dash/infra.env` (mode 600). It is safe to re-run. If the key exists in Linode but not in the env file, revoke it and run the script again.
2. Create the Tailscale auth key and put it in `~/.config/dash/infra.env` as `TF_VAR_tailscale_auth_key`.
3. Plan and apply as below.

The first apply also used a one-off `imports.tf`, which mapped the three old DoubleL boxes onto their successors so that apply replaced them. It was deleted once they were gone. Imports are not part of the normal flow.

## State

State lives in Linode Object Storage, in the `dash-tfstate` bucket in `us-southeast`. OpenTofu reaches it through Linode's S3-compatible API at `https://us-southeast-1.linodeobjects.com`, which is why the backend block says `"s3"`. No AWS account is involved. The backend only reads its credentials from `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, so `tofu.sh` copies the Linode keys into those names for the `tofu` process alone. The bucket is versioned, and a lock file in the bucket guards concurrent runs (`use_lockfile`).

## Plan and apply

```sh
./tofu.sh init
./tofu.sh plan -out=dash.tfplan
./tofu.sh apply dash.tfplan
```

A saved plan file holds the Tailscale key in plain text. Keep it out of the repo (`*.tfplan` is ignored) and delete it after the apply. CI runs `tofu fmt -check` and `tofu validate` only; plans and applies run by hand.

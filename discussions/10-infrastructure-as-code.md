# 10 · Infrastructure as code

## Why now
`dash.doublel.studio` needs DNS before the first deploy, and passkeys depend on that domain. We should decide how infrastructure is managed before anything is created by hand.

## What we know
- DNS for `doublel.studio` is on **Cloudflare**. Cloudflare's Terraform provider is actively maintained (v5.x).
- **Fly.io's official Terraform provider is archived** (`fly-apps/terraform-provider-fly`, last push 2023-11). Fly expects `fly.toml` plus `flyctl` (or the Machines API) instead.
- Hosting and DB choices are in [06](./06-hosting-and-deploy.md). This doc covers how we manage whatever we pick.

## Starting recommendation
Split by what each tool does well:

| Concern | Tool |
|---|---|
| Cloudflare DNS records, and later proxy, WAF or R2 if wanted | Terraform (or OpenTofu) in `infra/terraform/` |
| Fly apps: config, scaling, regions, health checks | `fly.toml` per app, committed alongside the app |
| Fly one-offs: create app, volumes, certs, IPs | idempotent scripts in `infra/scripts/` that wrap `flyctl` |
| Secrets | `fly secrets` set from CI or the scripts. Never in the repo or Terraform state |
| Deploys | GitHub Actions running `flyctl deploy` on merge |

**The ordering wrinkle:** custom domains on Fly need DNS records whose values come from Fly. `fly ips` gives the A/AAAA records and `fly certs add` gives the ACME challenge CNAME. So the bootstrap order is: script creates the Fly app → IPs and cert → Terraform writes the Cloudflare records using those values (passed in as variables or read from a script's output).

## Questions
1. **Terraform or OpenTofu?** Or something TypeScript-native, like Pulumi or SST, to stay in one language?
2. **State backend:** Cloudflare R2 (S3-compatible, keeps everything in Cloudflare), HCP Terraform's free tier, or a GCS/S3 bucket?
3. **Does Terraform manage the whole `doublel.studio` zone** or only the `dash` records? Importing the zone means every existing record has to be imported too.
4. **Cloudflare proxy (orange cloud) in front of Fly,** or DNS-only? Proxying adds caching and WAF but complicates Fly's certs and websockets/SSE.
5. **Who applies?** Locally by hand, or CI plan on PR and apply on merge?
6. **Do GitHub resources belong in IaC as well** (repo settings, branch rules, the GitHub App)? The GitHub provider can cover some of this.
7. **Managed Postgres:** if it's Neon or Supabase, both have providers. If it's Fly Managed Postgres, scripts again.
8. **API tokens:** a scoped Cloudflare token for DNS edits on one zone only, and a Fly deploy token per app. Where do they live (GitHub Actions secrets, 1Password)?

## Done when
The tool split, state backend, zone scope, apply model and bootstrap order are agreed, and the scaffold issue is written.

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

## Option: write our own Fly provider
Terraform's core knows nothing about specific clouds. Each provider is a separate Go binary that core runs and talks to over gRPC (plugin protocol v5/v6). A provider declares resource schemas and implements Create, Read, Update and Delete. Core takes care of graph ordering, diffs, state, drift detection and import. Providers are written with the Terraform Plugin Framework and work with OpenTofu too.

**Scope: the parts that sit still**
- `fly_app`
- `fly_ip`: gives the A/AAAA values for DNS
- `fly_cert`: exposes the validation record values
- `fly_volume`, if needed

**Leave Machines and deploys to `flyctl deploy`.** They change on every deploy, so Terraform and flyctl would fight over them. **Keep secrets out as well**, because Terraform state stores values in plain text.

**Why bother:** it removes the bootstrap ordering problem. The cert's validation values feed straight into `cloudflare_dns_record`, so one `plan` covers the whole setup.

**Starting point:** fork the skeleton of the archived `fly-apps/terraform-provider-fly` (MIT, Go). Keep it as its own GGC repo, not part of the Dash monorepo. Use `dev_overrides` or a local filesystem mirror for private use. Publishing to the Terraform or OpenTofu registry later needs GoReleaser and GPG-signed releases.

**Cost:** a few hours of agent time for four resources with acceptance tests against a throwaway Fly app, plus review. After that, we maintain it ourselves whenever Fly's API changes.

**Check first:** do IPs and certs live in Fly's GraphQL API or the Machines REST API? That decides whether a generic REST provider is viable, and how much work a custom one is.

**Alternatives to a custom provider:**
- A generic REST provider such as `Mastercard/restapi`. It needs no Go, but it's weak on GraphQL and its diffs are poor.
- Pulumi dynamic providers, which put the CRUD in TypeScript inline. That means adopting Pulumi instead of Terraform.

## Questions
1. **Terraform or OpenTofu?** Or something TypeScript-native, like Pulumi or SST, to stay in one language?
2. **For Fly: a custom provider, scripts, a generic REST provider, or Pulumi?** If it's a custom provider, decide its repo name and whether it's published to a registry.
3. **State backend:** Cloudflare R2 (S3-compatible, keeps everything in Cloudflare), HCP Terraform's free tier, or a GCS/S3 bucket?
4. **Does Terraform manage the whole `doublel.studio` zone** or only the `dash` records? Importing the zone means every existing record has to be imported too.
5. **Cloudflare proxy (orange cloud) in front of Fly,** or DNS-only? Proxying adds caching and WAF but complicates Fly's certs and websockets/SSE.
6. **Who applies?** Locally by hand, or CI plan on PR and apply on merge?
7. **Do GitHub resources belong in IaC as well** (repo settings, branch rules, the GitHub App)? The GitHub provider can cover some of this.
8. **Managed Postgres:** if it's Neon or Supabase, both have providers. If it's Fly Managed Postgres, scripts again.
9. **API tokens:** a scoped Cloudflare token for DNS edits on one zone only, and a Fly deploy token per app. Where do they live (GitHub Actions secrets, 1Password)?

## Done when
The tool split (including the Fly approach), state backend, zone scope, apply model and bootstrap order are agreed, and the scaffold issue is written.

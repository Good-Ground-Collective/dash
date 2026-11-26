# 06 · Hosting and deploy

## What we know
- The plan is to trial **fly.io**.
- The domain is **`dash.doublel.studio`**. The passkey RP ID is bound to it (see [01](./01-identity-and-auth.md)).

## Questions
1. **Subdomains:** where do the API and webhooks live? `dash.doublel.studio` alone with path routing, or `api.dash.doublel.studio`? Where is DNS hosted, and how do we point it at Fly?
2. **Public or tailnet-only?** Webhooks need a public ingress. Is the dashboard UI itself public, behind passkeys, or tailnet-only?
3. **Postgres:** Fly Managed Postgres, Neon, or Supabase?
4. **Environments:** prod only plus local? Do we want a staging environment?
5. **Infra as code:** `fly.toml` only, or Terraform as well?
6. **CI/CD:** GitHub Actions deploying on merge to main, with release tags?
7. **Secrets:** Fly secrets? Where do the GitHub App private key and webhook secret live?
8. **Cost ceiling:** what's acceptable per month?

## Done when
The host, DB, domain, environments and deploy pipeline are picked.

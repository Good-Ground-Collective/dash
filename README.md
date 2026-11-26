# Dash

A personal dashboard for work life at a glance, meant to grow into a software factory. It's a Good Ground Collective project.

Open questions live in [discussions](./discussions). Each one is a conversation starter for a working session. When a discussion reaches its conclusions, those conclusions become GitHub issues in the Dash project and the discussion file is deleted.

## Layout

```
apps/web              SvelteKit web app
apps/mission-control  Fastify server with Drizzle and DBOS on Postgres
packages/standards    Zod schemas shared between components
packages/config       Shared tsconfig, ESLint and Stylelint config
```

The workspace uses pnpm and Turborepo, on Node 24 LTS.

## Setup

1. Use Node 24 (`.nvmrc`), for example `fnm use` or `nvm use`.
2. Enable Corepack, which provides the pnpm version pinned in `package.json`:

   ```sh
   corepack enable
   ```

3. Authenticate to GitHub Packages. The lint rules come from `@good-ground-collective/preflight`, which GitHub Packages serves only to authenticated clients. pnpm ignores credentials in a repository `.npmrc`, so the token goes in your user `~/.npmrc` as an environment reference:

   ```sh
   echo '//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}' >> ~/.npmrc
   export NODE_AUTH_TOKEN=$(gh auth token)
   ```

   Put the `export` line in your shell profile (or a tool such as direnv) so new shells keep the token. Any token with `read:packages` works. The `gh` CLI token has it once you run `gh auth refresh -s read:packages`.

4. Install:

   ```sh
   pnpm install
   ```

## Everyday commands

| Command                                    | What it does                                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `pnpm turbo run lint typecheck test build` | The CI checks, apart from `pnpm format:check`; CI limits pull requests to affected packages           |
| `pnpm lint`                                | ESLint with preflight on the root and each package with a `lint` script, plus Stylelint in `apps/web` |
| `pnpm typecheck`                           | `tsc --noEmit` on the root and each package with a `typecheck` script                                 |
| `pnpm test`                                | Vitest in each package with a `test` script                                                           |
| `pnpm build`                               | Build each package with a `build` script                                                              |
| `pnpm vitest`                              | Vitest across all projects from the root, in watch mode                                               |
| `pnpm format`                              | Prettier, writing changes                                                                             |
| `pnpm format:check`                        | Prettier, check only                                                                                  |

Add `--filter <package>` to run a task in one package, for example `pnpm turbo run test --filter @dash/standards`.

## Web app

`apps/web` is SvelteKit with adapter-node. Start it with `pnpm --filter @dash/web dev`. It calls Mission Control at `API_BASE_URL` (default `https://api.dash.doublel.studio`); set it to a local Mission Control, for example `API_BASE_URL=http://localhost:3000`. The shell renders without Mission Control.

The theme comes from the `dash-theme` and `dash-mode` cookies (`characters`; `light` or `dark`), applied to `<html>` during server rendering. Theme tokens live in `apps/web/src/lib/theme/`. Components take colour, type, spacing, radius and shadow from those custom properties.

`pnpm turbo run test:e2e --filter @dash/web` builds the app and runs the Playwright smoke test. Run `pnpm --filter @dash/web exec playwright install chromium` once first.

The service accounts e2e (`service-accounts.e2e.test.ts`) runs against its own Mission Control stub and signs in through the stub's `/__stub/sign-in`.

The passkey e2e (`passkeys.e2e.test.ts`) drives setup, passkey settings, sign-out and autofill sign-in with Chromium's virtual authenticator. By default it runs against a small Mission Control stub, because CI has no Postgres. To run it against the real thing, start Mission Control on a fresh database with `DEV_WEB_ORIGIN=http://localhost:4320`, copy the setup token it logs, then run:

```sh
DASH_E2E_API_BASE_URL=http://localhost:3000 DASH_E2E_SETUP_TOKEN=<token> \
  pnpm --filter @dash/web exec playwright test --project passkeys
```

## Lint gates

ESLint uses preflight's `recommended` config, which includes the blocking `go-no-go` set, and its `layout` config with the module → role → concept layout under `src/`. Packages and the repo root pick the shared config up from `@dash/config/eslint`.

## Mission Control

Mission Control runs on Node 24's built-in TypeScript type stripping, so there is no build step: `node src/main.ts` is the entry point in every environment. It needs Postgres, which Docker Compose provides locally on port 54329:

```sh
cd apps/mission-control
cp .env.example .env
pnpm db:up
pnpm dev
```

`pnpm dev` applies migrations, then starts the HTTP server and DBOS together and restarts on change. `pnpm dev` at the repository root does the same through Turborepo. Check it with `curl localhost:3000/healthz`.

| Command            | What it does                                                     |
| ------------------ | ---------------------------------------------------------------- |
| `pnpm db:up`       | Start the local Postgres container                               |
| `pnpm db:down`     | Stop it. The `dash-mission-control-pgdata` volume keeps the data |
| `pnpm db:generate` | Generate a Drizzle migration from the `*-table.ts` files         |
| `pnpm db:migrate`  | Apply pending migrations; deploys run this before `pnpm start`   |
| `pnpm start`       | Start without watching                                           |

Each module under `src/` is a folder with a `module.ts`, and its routes register in their own encapsulated Fastify scope. Preflight's `module-layout` rule sets the folders inside a module. `src/heartbeat` is an example of every piece, a DBOS schedule and queue included, and goes once real modules land.

### Auth

`src/auth` runs [Better Auth](https://www.better-auth.com) under `/api/auth`, stored in Postgres through Drizzle. Better Auth's `user` table holds every principal, and its `kind` column says what it is: `user` for a person, `service` for a bench or agent. A service principal has a `service_profile` row naming its owner, gets a synthetic `svc-<id>@service.invalid` email and can't hold a web session or register a passkey.

Sessions last 30 days and slide forward once a day old. The session cookie is HttpOnly and SameSite=Lax. In production it is also Secure and set on `dash.doublel.studio`, so the web app's server can read it. Locally it is host-only and works over plain http. Origins in the CORS allowlist are Better Auth's trusted origins.

People sign in only with passkeys. The relying party is the web app: RP ID `dash.doublel.studio` and origin `https://dash.doublel.studio` in production, `localhost` and `DEV_WEB_ORIGIN` locally. Adding, renaming or removing a passkey needs a passkey sign-in from the last 15 minutes, and nobody can remove their last passkey.

The first person signs up with a setup token. While nobody has signed up, every boot logs a new one-time token (a `warn` line with `setupToken`) and stores only its hash. Open `/setup` in the web app, enter the token with your name and email, and enrol a passkey: that creates the account and signs you in. Setup closes for good once anyone has signed up, and a restart then logs nothing.

`BETTER_AUTH_SECRET` (at least 32 characters, for example from `openssl rand -base64 32`) signs the cookies, and `BETTER_AUTH_URL` is Mission Control's public origin. `.env.example` has a placeholder secret for local use only, and production refuses it. In production `BETTER_AUTH_URL` must be https and on `dash.doublel.studio` or a subdomain, or browsers would drop the session cookie.

Mission Control's tests don't need Postgres, and CI runs none: auth tests use Better Auth's memory adapter, and repositories are tested through in-memory fakes. Behaviour that lives in Postgres (transactions, foreign keys, check constraints) is checked by hand against the Compose database when a migration changes it.

#### Service accounts and API keys

Benches and agents authenticate with API keys from Better Auth's api-key plugin. Each key belongs to a service principal (`references: "user"`). People manage them at `/settings/service-accounts`, backed by `/api/auth/service-accounts/{list,create,revoke}` and `/api/auth/service-accounts/keys/{create,revoke}`. Creating or revoking needs a passkey sign-in from the last 15 minutes, like passkey changes. The plugin's own `/api/auth/api-key/*` endpoints are closed.

- A **bench** account (`bench_id`, one per machine) may report for any agent on that bench. Its keys never expire.
- An **agent** account (`agent_name`) may report only as that agent. Its keys expire after 90 days.
- Keys start `dash_live_` in production and `dash_dev_` elsewhere. Only a hash is stored, the key is shown once, and its first characters are kept to recognise it. `last_used_at` updates on every use.
- Scopes live in `src/auth/definitions/api-key-scopes`: `heartbeat:write` and `telemetry:write` so far.
- Revoking deletes the key, or the account with all its keys, so the next request with it fails.

Agent-facing routes take `auth.agentAuthentication.require(scope)` as an `onRequest` hook, which accepts `Authorization: Bearer dash_…` or `x-api-key`, and read the caller with `agentAuthentication.caller(request)`. The first such route is `POST /api/agents/:agentName/heartbeats` (`heartbeat:write`, optional body `{ "sentAt": "<ISO time>" }`), which stores a row in `agent_heartbeat` and answers 201.

## CI

`.github/workflows/ci.yml` installs with the workflow's `GITHUB_TOKEN` (`packages: read`), checks formatting, then runs lint, typecheck, test and build. It then installs Chromium (cached by Playwright version) and runs `test:e2e`. Pull requests run only the packages Turborepo marks as affected; pushes to `main` run everything. The repository needs Actions read access to the preflight package, granted in the package's settings.

Dependabot updates npm packages and GitHub Actions weekly. To resolve preflight it reads GitHub Packages with the `DEPENDABOT_PACKAGES_TOKEN` Dependabot secret, a token with `read:packages`.

## Tickets

Work is tracked in GitHub issues on this repo and the Dash project. `.claude/settings.json` points the flight-rules CLI at this repo's issues, so tickets can be broken down and executed with flight-rules.

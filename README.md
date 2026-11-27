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

#### Recovery

There's no email fallback. Someone who has lost every passkey gets back in with a recovery code or, failing that, the break-glass command. Both end by registering a new passkey, which signs them in.

- **Recovery codes.** A person has 10 one-time codes, formatted `xxxx-xxxx`. `POST /api/auth/recovery-codes/generate` (a passkey sign-in from the last 15 minutes) returns a new pending set and its `setId`, the only time the codes are readable; generating again discards a pending set. `POST /api/auth/recovery-codes/confirm` with `{ "setId" }` makes that set the person's codes and deletes every other set, so the old codes stop working. `GET /api/auth/recovery-codes/status` answers `{ confirmed, remaining }`. The `recovery_code` table keeps only an HMAC of each code, keyed with `BETTER_AUTH_SECRET` and the person's id, so rotating the secret voids every code.
- **Redeeming.** `POST /api/auth/recovery/redeem` with `{ "email", "code" }` answers `{ "enrolment" }`, which the web app passes as the passkey registration `context` with `createSession`, as setup does. Registering spends the code, so a code is used once and an abandoned ceremony keeps it. A wrong code, a used code and an unknown email all get the same 401 `RECOVERY_REJECTED`. Attempts are limited to 5 per email and 100 overall every 15 minutes, counted in memory, and the 429 carries `Retry-After`. That allows about 9,600 guesses a day against roughly 8.5e11 possible codes. The overall limit is shared, so a flood of attempts against any emails suspends code recovery for everyone until its window passes; the break-glass command still works. Either limit logs one warning per window when it first refuses an attempt, without the email or code, so it shows in `bin/kamal app logs`.
- **Sessions.** Registering a passkey through a code or a break-glass link signs the person out of every other session in the same transaction, in case whoever has the lost passkeys is still signed in.
- **Logs.** Passkey registration sends a setup or recovery enrolment as `?context=`, so Mission Control logs request paths without their query strings. kamal-proxy's access log on `dash-app` still records full URLs, query strings included, so an unspent enrolment can be read there until it expires (10 or 15 minutes). Only someone with host access can read that log, and they can already run the break-glass command.
- **Break glass.** `dash admin recover <email>`, run in the Mission Control container, prints a link to `/recover/passkey` on the web app that registers a new passkey for that person. It works once and expires after 15 minutes. Shell access to `dash-app` over the tailnet is the root of trust, so the command needs no other proof. See [Deploying by hand](#deploying-by-hand) for how to run it. Locally, `pnpm dash admin recover <email>` runs it against the Compose database.

`BETTER_AUTH_SECRET` (at least 32 characters, for example from `openssl rand -base64 32`) signs the cookies, and `BETTER_AUTH_URL` is Mission Control's public origin. `.env.example` has a placeholder secret for local use only, and production refuses it. In production `BETTER_AUTH_URL` must be https and on `dash.doublel.studio` or a subdomain, or browsers would drop the session cookie.

Mission Control's tests don't need Postgres, and CI runs none: auth tests use Better Auth's memory adapter, and repositories are tested through in-memory fakes. Behaviour that lives in Postgres (transactions, foreign keys, check constraints) is checked by hand against the Compose database when a migration changes it.

#### Service accounts and API keys

Benches and agents authenticate with API keys from Better Auth's api-key plugin. Each key belongs to a service principal (`references: "user"`). People manage them at `/settings/service-accounts`, backed by `/api/auth/service-accounts/{list,create,revoke}` and `/api/auth/service-accounts/keys/{create,revoke}`. Creating or revoking needs a passkey sign-in from the last 15 minutes, like passkey changes. The plugin's own `/api/auth/api-key/*` endpoints are closed.

- A **bench** account (`bench_id`, one per machine) may report for any agent on that bench. Agents aren't registered to benches yet, so in practice a bench key may report any agent name, even one that also has an agent account; the heartbeat's `bench_id` tells them apart. Its keys never expire.
- An **agent** account (`agent_name`) may report only as that agent. Its keys expire after 90 days.
- Keys start `dash_live_` in production and `dash_dev_` elsewhere. Only a hash is stored, the key is shown once, and its first characters are kept to recognise it. `last_used_at` updates on every use.
- Scopes live in `src/auth/definitions/api-key-scopes`: `heartbeat:write` and `telemetry:write` so far. They are chosen when an account is created, and every key it is issued, including replacements, gets exactly those.
- Revoking deletes the key, or the account with all its keys, so the next request with it fails.

Agent-facing routes take `auth.agentAuthentication.require(scope)` as an `onRequest` hook, which accepts `Authorization: Bearer dash_…` or `x-api-key`, and read the caller with `agentAuthentication.caller(request)`. The first such route is `POST /api/agents/:agentName/heartbeats` (`heartbeat:write`, optional body `{ "sentAt": "<ISO time>" }`; an empty body is fine, with or without `Content-Type: application/json`), which stores a row in `agent_heartbeat` and answers 201.

## Deploys

Production is one Linode box, `dash-app`, running both apps under [Kamal 2](https://kamal-deploy.org) behind kamal-proxy, which gets Let's Encrypt certificates: web at `https://dash.doublel.studio` and Mission Control at `https://api.dash.doublel.studio`. Each app has its own config in `deploy/`. Kamal reaches the box over the tailnet as `dash`.

Images live on GHCR as `ghcr.io/good-ground-collective/dash-web` and `ghcr.io/good-ground-collective/dash-mission-control`, tagged with the commit SHA and, when CI releases them, with the version (`v1.2.0`). They are built for linux/amd64 with Node 24 slim, run as the `node` user, and get the GitHub Packages token only as a BuildKit secret in a build stage that never ships. `bin/image` builds an app's image, then runs `bin/image-secret-scan`, which fails if the image history, config or filesystem holds a token, a private key, a `.npmrc` or `.env` file, or the value of any production secret. Only then does `--push` publish it, with one more tag per `--tag`. Each image carries `APP_VERSION` (the first `--tag`, or `dev`) and `APP_COMMIT` (the commit SHA) as runtime environment: the web app shows them in the account menu and Mission Control adds them to `/healthz`. `bin/test-image-secret-scan` checks the scan itself against a canary image with planted credentials.

`bin/kamal` runs Kamal from its pinned official image, so you need Docker but not Ruby. Secrets come from the environment through `.kamal/secrets`, which names variables and holds no values. Locally, the wrapper fills unset ones from the `DASH_*` lines of `~/.config/dash/infra.env` and, if `gh` is logged in, from `gh`. Kamal logs the server in to GHCR on every deploy, and the wrapper logs it out afterwards. The box pulls with that login, so it works whether the packages are public or private. Set `KAMAL_REGISTRY_PASSWORD` to a token with only `read:packages` so a broad `gh` token never lands on the box, even briefly. `bin/image --push` uses `GHCR_PUSH_TOKEN` instead, which needs `write:packages` and defaults to the `gh` token.

### Release pipeline

Every push to `main` runs the full CI, then releases and deploys whatever passed:

1. `shellcheck`, `verify` (including every end-to-end test) and `tofu` must all pass.
2. `release` runs [semantic-release](https://semantic-release.gitbook.io) over the conventional commits since the last `vX.Y.Z` tag. `feat` cuts a minor, `fix` and `perf` a patch, and a `!` or `BREAKING CHANGE` footer a major. It pushes the tag and a GitHub release with notes, and commits nothing back to `main`. The whole repository shares one version. Commits that need no release (`docs`, `chore`, `test` and so on) stop the pipeline here.
3. `images` runs in the `production` environment, so its scan can check the production secrets, and builds, scans and pushes both images with `bin/image --push --tag vX.Y.Z`, using the job's `GITHUB_TOKEN`.
4. `deploy` runs in the `production` environment, one at a time (`concurrency: production`, never cancelled). It runs `bin/deploy-gate` to confirm its version is still the newest release, joins the tailnet as an ephemeral `tag:ci` node, checks `dash-app`'s SSH host key against the pinned `DASH_APP_SSH_HOST_KEY` variable, deploys Mission Control first (it migrates at boot), then web, both with `--skip-push --version vX.Y.Z`, then checks both `/healthz` endpoints. The box logs in to GHCR with the job's `GITHUB_TOKEN`, which expires when the job ends.

Pull requests run `image-check` for each app, so a broken image fails before merge rather than after release. When the pull request touches anything an image is built from (`apps/`, `packages/`, `integrations/`, a Dockerfile, `.dockerignore`, the root package and workspace files, the lockfile, `bin/image` or `ci.yml`), it builds the image with `bin/image` without pushing, which runs the same secret scan, then boots it: Mission Control against a throwaway Postgres until `/healthz` answers, and web until its `/healthz` does. Otherwise it posts a notice and skips its steps, so the job still passes and can be a required check. It needs no environment or secrets beyond the job's `GITHUB_TOKEN`, and keeps BuildKit layers in the GitHub Actions cache through `IMAGE_CACHE_FROM` and `IMAGE_CACHE_TO`.

`images` fails until `production` holds `DASH_BETTER_AUTH_SECRET` and `DASH_DATABASE_URL`. Until it also holds the Tailscale and SSH secrets below, and the host key variable is set, `deploy` posts a notice and skips; releases and image pushes still happen. To redeploy after a failure, re-run the failed jobs: `release` finds the tag already on the commit and hands the same version on. `deploy` only ships the newest `vX.Y.Z` tag, so re-running an older run posts a notice and skips instead of rolling production back; roll back by hand as below.

### One-time deploy setup

1. In the Tailscale policy, let admins own `tag:ci` and let it reach SSH on the boxes:

   ```json
   "tagOwners": { "tag:ci": ["autogroup:admin"] },
   "grants": [{ "src": ["tag:ci"], "dst": ["tag:dash"], "ip": ["tcp:22"] }]
   ```

2. Create a Tailscale OAuth client with the `auth_keys` write scope and tag `tag:ci`.
3. Make the deploy key on your laptop, outside the repository: `ssh-keygen -t ed25519 -N '' -C dash-ci-deploy -f dash-ci-deploy`.
4. Add its public half to the running `dash-app`. The `from` option limits it to tailnet addresses. `dash` has passwordless sudo, so `DASH_DEPLOY_SSH_KEY` is effectively root on `dash-app`; [#57](https://github.com/Good-Ground-Collective/dash/issues/57) tracks a lower-privileged CI deploy user.

   ```sh
   printf 'from="100.64.0.0/10,fd7a:115c:a1e0::/48",no-agent-forwarding,no-port-forwarding,no-X11-forwarding %s\n' "$(cat dash-ci-deploy.pub)" \
     | ssh dash@dash-app 'cat >> ~/.ssh/authorized_keys'
   ```

   The prefix must match `deploy_key_options` in `infra/tofu/main.tf`. Also add the public key to `deploy_ssh_public_keys` in `infra/tofu/variables.tf`, so a rebuilt `dash-app` gets it from cloud-init with those options. Running boxes ignore the change, so no apply is needed.

5. Under Settings, Environments, create `production` and limit its deployment branches to `main`. Give it all five secrets the pipeline reads, then delete the private key file. `images` runs in the environment too and fails without the two `DASH_*` secrets, because its scan must prove neither leaked into an image:

   ```sh
   gh secret set TS_OAUTH_CLIENT_ID --env production
   gh secret set TS_OAUTH_SECRET --env production
   gh secret set DASH_DEPLOY_SSH_KEY --env production < dash-ci-deploy
   gh secret set DASH_BETTER_AUTH_SECRET --env production
   gh secret set DASH_DATABASE_URL --env production
   ```

6. In each GHCR package's settings, under Manage Actions access, give this repository the Write role, so the workflow's `GITHUB_TOKEN` can push and pull.
7. Pin `dash-app`'s SSH host key in the `DASH_APP_SSH_HOST_KEY` repository variable. It is public, so a variable rather than a secret. Scan it over the tailnet and check the fingerprint against `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the box:

   ```sh
   ssh-keyscan -t ed25519 dash-app | cut -d' ' -f2- | gh variable set DASH_APP_SSH_HOST_KEY
   ```

   The deploy writes it to `known_hosts` and connects with `StrictHostKeyChecking=yes`, so a changed host key stops the deploy. Update the variable after rebuilding `dash-app`.

8. Delete the repository-level `DASH_BETTER_AUTH_SECRET` and `DASH_DATABASE_URL` secrets, so only `main` deploys can read them: `gh secret delete DASH_BETTER_AUTH_SECRET` and `gh secret delete DASH_DATABASE_URL`.

### Deploying by hand

From the repository root:

```sh
bin/image web --push
bin/kamal deploy -c deploy/web.yml --skip-push --version "$(git rev-parse HEAD)"

bin/image mission-control --push
bin/kamal deploy -c deploy/mission-control.yml --skip-push --version "$(git rev-parse HEAD)"
```

To roll back, deploy an older tag the same way, for example `--version v1.1.0`. The first deploy to a fresh box is `kamal setup` instead of `kamal deploy`, which also installs Docker and boots kamal-proxy. `bin/kamal app logs -c deploy/mission-control.yml` shows the logs, including the first boot's setup token.

If someone has lost every passkey and every recovery code, print them a one-time sign-in link from the running container. Open it on the device that should get the new passkey within 15 minutes:

```sh
bin/kamal app exec -c deploy/mission-control.yml --interactive --reuse 'dash admin recover you@example.com'
```

Mission Control migrates its database as the container boots, before it listens. kamal-proxy moves traffic to a new container only once its `/healthz` reports the database and workflows ok, so a failed migration leaves the old container serving. Migrations must therefore stay compatible with the version still running. Server-Sent Events on `/events` pass through kamal-proxy unbuffered: it stops buffering `text/event-stream` responses, and its 30-second response timeout covers only the wait for headers.

## CI

`.github/workflows/ci.yml` runs shellcheck on the host and deploy scripts, tests `bin/deploy-gate` with `bin/test-deploy-gate`, and runs `tofu fmt` and `tofu validate` on `infra/tofu`. The `verify` job installs with the workflow's `GITHUB_TOKEN` (`packages: read`), checks formatting, then runs lint, typecheck, test and build. It then installs Chromium (cached by Playwright version) and runs `test:e2e`. Pull requests run only the packages Turborepo marks as affected; pushes to `main` run everything, then release and deploy as described under [Release pipeline](#release-pipeline). Each job gets only the permissions it needs: `release` can push tags, `images` can write packages, and the rest read. The repository needs Actions read access to the preflight package, granted in the package's settings.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org), since they decide the next version.

Dependabot updates npm packages and GitHub Actions weekly. It skips major updates of `conventional-changelog-conventionalcommits`, because 10.x needs a newer changelog writer than semantic-release's notes generator ships; `bin/test-release-notes`, run in `verify`, fails if the two drift apart again. To resolve preflight it reads GitHub Packages with the `DEPENDABOT_PACKAGES_TOKEN` Dependabot secret, a token with `read:packages`.

## Tickets

Work is tracked in GitHub issues on this repo and the Dash project. `.claude/settings.json` points the flight-rules CLI at this repo's issues, so tickets can be broken down and executed with flight-rules.

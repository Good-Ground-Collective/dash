# Dash

A personal dashboard for work life at a glance, meant to grow into a software factory. It's a Good Ground Collective project.

Open questions live in [discussions](./discussions). Each one is a conversation starter for a working session. When a discussion reaches its conclusions, those conclusions become GitHub issues in the Dash project and the discussion file is deleted.

## Layout

```
apps/web              SvelteKit web app (placeholder)
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

## CI

`.github/workflows/ci.yml` installs with the workflow's `GITHUB_TOKEN` (`packages: read`), checks formatting, then runs lint, typecheck, test and build. Pull requests run only the packages Turborepo marks as affected; pushes to `main` run everything. The repository needs Actions read access to the preflight package, granted in the package's settings.

Dependabot updates npm packages and GitHub Actions weekly. To resolve preflight it reads GitHub Packages with the `DEPENDABOT_PACKAGES_TOKEN` Dependabot secret, a token with `read:packages`.

## Tickets

Work is tracked in GitHub issues on this repo and the Dash project. `.claude/settings.json` points the flight-rules CLI at this repo's issues, so tickets can be broken down and executed with flight-rules.

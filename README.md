# Dash

A personal dashboard for work life at a glance, meant to grow into a software factory. It's a Good Ground Collective project.

Open questions live in [discussions](./discussions). Each one is a conversation starter for a working session. When a discussion reaches its conclusions, those conclusions become GitHub issues in the Dash project and the discussion file is deleted.

## Layout

```
apps/web              SvelteKit web app (placeholder)
apps/mission-control  Fastify server (placeholder)
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

   Any token with `read:packages` works. The `gh` CLI token has it once you run `gh auth refresh -s read:packages`.

4. Install:

   ```sh
   pnpm install
   ```

## Everyday commands

| Command                                    | What it does                                            |
| ------------------------------------------ | ------------------------------------------------------- |
| `pnpm turbo run lint typecheck test build` | Everything CI runs                                      |
| `pnpm lint`                                | ESLint with preflight, plus Stylelint in `apps/web`     |
| `pnpm typecheck`                           | `tsc --noEmit` in every package                         |
| `pnpm test`                                | Vitest in every package                                 |
| `pnpm build`                               | Build every package                                     |
| `pnpm vitest`                              | Vitest across all projects from the root, in watch mode |
| `pnpm format`                              | Prettier, writing changes                               |
| `pnpm format:check`                        | Prettier, check only                                    |

Add `--filter <package>` to run a task in one package, for example `pnpm turbo run test --filter @dash/standards`.

## Lint gates

ESLint uses preflight's `recommended` config, which includes the blocking `go-no-go` set, and its `layout` config with the module → role → concept layout under `src/`. Tests sit in a `__tests__/` folder beside the code they cover. Packages pick the shared config up from `@dash/config/eslint`.

## CI

`.github/workflows/ci.yml` installs with the workflow's `GITHUB_TOKEN` (`packages: read`), checks formatting, then runs lint, typecheck, test and build. Pull requests run only the packages Turborepo marks as affected; pushes to `main` run everything. The repository needs Actions read access to the preflight package, granted in the package's settings.

Dependabot updates npm packages and GitHub Actions weekly. To resolve preflight it reads GitHub Packages with the `DEPENDABOT_PACKAGES_TOKEN` Dependabot secret, a token with `read:packages`.

## Tickets

Work is tracked in GitHub issues on this repo and the Dash project. `.claude/settings.json` points the flight-rules CLI at this repo's issues, so tickets can be broken down and executed with flight-rules.

# 05 · Stack and repo layout

## What we know
- TurboRepo monorepo, under GGC.
- Svelte for the web app.
- The daemon is compiled; Go is the lean (cross-platform Linux and macOS, gopsutil).
- Directories are sliced **by module, not by surface** (`src/settings/{services,repos}`), following flight-rules and preflight.
- It's a fresh start. No existing GGC repos (software-factory, design-system) carry over.

## Starting recommendation
```
apps/dash               SvelteKit, thin client (UI only)
apps/mission-control    TS server: Hono or Fastify, Postgres, auth, ingest, integrations, SSE
apps/bench-daemon       Go; turbo task wraps `go build` / `go test`
packages/standards      Zod schemas → generated JSON Schema → generated Go types
packages/harness-hooks  Claude Code first
discussions/            these docs, deleted as they settle
```

## Questions
1. Mission Control as its own server, or SvelteKit server routes? Strawman: its own server. It runs long-lived work (webhooks, pollers, the watchdog) and serves non-browser clients.
2. ORM or query builder: Drizzle or Kysely?
3. Jobs and queues: in-process, pg-boss, or a hosted queue?
4. Realtime to the browser: SSE or WebSockets?
5. Package manager: pnpm?
6. Tooling: does preflight (lint gates) apply from day one?

## Done when
The layout and core libraries are chosen and the scaffold issue is written.

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
3. **Durable jobs, queues and schedules:** the GitHub work needs a webhook processing queue, a 15-minute reconcile (#26) and rate-limited 5-minute guest polling (#27). **Recommendation: DBOS** (`@dbos-inc/dbos-sdk`, MIT, 5.7.x as of 2026-11).
   - It runs as a library inside Mission Control and keeps its state in our Postgres, so there's no extra service.
   - It provides durable workflows and steps, cron-style scheduled workflows, and `WorkflowQueue` with concurrency and rate limits.
   - **Fly has no equivalent.** Its scheduled Machines only run hourly, daily, weekly or monthly, and there's no queue or workflow service.
   - Alternatives: pg-boss (queue only), or a hosted service such as Inngest or Trigger.dev (another vendor).
4. Realtime to the browser: SSE or WebSockets?
5. Package manager: pnpm?
6. Tooling: does preflight (lint gates) apply from day one?

## Done when
The layout and core libraries are chosen and the scaffold issue is written.

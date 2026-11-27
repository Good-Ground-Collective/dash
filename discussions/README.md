# Discussions

Each file is the starting point for one working session, not a spec. A file:

- states what has to be decided and why it matters now
- records what we already know, plus constraints carried over from the planning notes
- gives a starting recommendation, so the session has something to push against
- lists the questions to work through
- says what "done" looks like for the conversation

When a discussion is settled, write its decisions into GitHub issues in the Dash project, link them from the PR that deletes the file, and remove the file.

## Order

Two tracks run side by side. Design doesn't wait on the stack, because mocks don't need code.

| Step | Discussion | Why here |
|---|---|---|
| ✓ | 01 Identity: concluded in #1 → build issues #11–#15 | |
| ✓ | 02 Design direction: concluded in #2 → Characters theme first (#17, #18); Loud, disciplined (#19), Newspaper (#20) and the briefing (#21) later | |
| ✓ | 04 GitHub integration: concluded in #4 → #25–#29 (owned App + guest PATs, read-only feed) | |
| ✓ | 05 Stack: concluded in #5 → #32–#34 (pnpm/Turbo, SvelteKit 3 + Fastify on two origins, Drizzle, DBOS, SSE for realtime, preflight) | |
| ✓ | 06 Hosting + 10 IaC: concluded in #6 and #10 → #42 (Linode boxes rebuilt with OpenTofu, self-hosted Postgres with pgBackRest, Kamal deploys, release pipeline) | |
| ✓ | 11 Objectives: concluded in #22 → #52–#55 (initiative → epic → ticket as a read-only lens over GitHub Projects and sub-issues, Jira later; providers behind `integrations/core` interfaces) | |
| ✓ | 03 Onboarding: concluded in #3 → epic #70 with #71–#77 (bootstrap only, required recovery codes, skippable GitHub connect for your account and every org, a setup checklist on the empty home) | |
| ✓ | 07 Communication standards: concluded in #7 → epic #78 with #80–#84 (`@good-ground/agentic-communication-standards` on npm; Zod 4 → JSON Schema → Go with a drift check; `schemaVersion` on every message; OpenTelemetry GenAI attribute names) | |
| later | [08 Agent heartbeats](./08-agent-heartbeats.md) → [09 Benches and the daemon](./09-benches-and-daemon.md) | Slices 2 and 3. Start once slice 1 is building. |

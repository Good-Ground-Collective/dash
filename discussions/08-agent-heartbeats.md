# 08 · Agent heartbeats (slice 2)

## What we know
Your "Musings On A Heartbeat Format" covers most of the shape:
- the v1 schema
- non-overlapping statuses
- hook → local JSONL outbox → relay
- dedupe on `(sessionId, seq)`
- rules-first triage

## New wrinkles to discuss
1. **Where do `summary` and `question` come from?** Claude Code hooks give events, not prose:
   - `Stop`: the turn ended, and the transcript path is available
   - `Notification`: a permission prompt or idle
   - `PreToolUse` on AskUserQuestion: the question and its options
   - `SubagentStop`

   Summary options: the last assistant message, truncated; a server-side LLM pass; or the agent writing its own summary through a skill.
2. **flight-rules already has an Ariadne-era heartbeat hook** (v1.58: a PostToolUse detached child taking about 55 ms) and `board post`. Ariadne is gone. Delete that code, or reshape it into the JSONL writer?
3. **Standalone hooks package or flight-rules?** The main doc lists hooks as their own component. Lean: standalone, and flight-rules can depend on it.
4. **Subagent fan-out:** subagent hooks share the parent `session_id`, and orchestrators can spawn more than 100 subagents. Key by parent session plus `agent_id`, and roll them up in the UI.
5. **Harness order:** Claude Code first. Codex, Cursor, Gemini and Pi each have different hook surfaces.
6. **Usage data:** Claude Code exports OTEL natively. Take tokens and cost from OTLP, and keep heartbeats status-only?
7. Watchdog N and K values, and notification channels.

## Done when
Spec v1 is frozen in the standards package (epic #78), the hook design is chosen, and the issues are written.

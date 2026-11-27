# @good-ground-collective/dash-hooks

Claude Code hooks that turn session events into [`agent.heartbeat`](../standards/README.md#agent-heartbeats) messages and append them to a local outbox. A relay sends the outbox to Mission Control later, so a heartbeat survives Mission Control restarting or the laptop going offline.

The package has one command, `dash-hooks <event>`, which reads the hook payload Claude Code writes to stdin. It never fails the session: whatever goes wrong, it prints nothing, exits 0 and writes the error to a log file.

## Install

The easiest way is the `dash-heartbeats` Claude Code plugin in this repository, which installs this package and registers every hook. See [`plugins/dash-heartbeats`](../../plugins/dash-heartbeats/README.md).

To install the package yourself, it is published to GitHub Packages, which needs a token with `read:packages` even though the package is public:

```sh
echo '@good-ground-collective:registry=https://npm.pkg.github.com' >> ~/.npmrc
echo '//npm.pkg.github.com/:_authToken=<token>' >> ~/.npmrc
npm install --global @good-ground-collective/dash-hooks
```

Then copy the `hooks` object from [`hooks/hooks.json`](hooks/hooks.json) (also exported as `@good-ground-collective/dash-hooks/hooks.json`) into `~/.claude/settings.json`. It runs `dash-hooks` from your `PATH`.

## What each event writes

| Claude Code event                                  | Heartbeat                                                                                                                                                                                                                   |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SessionStart`                                     | `complete`, the session's first heartbeat: idle until a prompt arrives. After a compaction, which can happen mid-turn, `working`. The model it reports is carried on the main agent's later heartbeats.                     |
| `UserPromptSubmit`                                 | `working`                                                                                                                                                                                                                   |
| `PreToolUse` on `AskUserQuestion`                  | `question`, with the question and its options copied verbatim. When it asks several questions at once, their texts are joined and the options left out.                                                                     |
| `PostToolUse`                                      | `working`, as a liveness heartbeat: at most one a minute per session while the agent is already working, so a long run of tool calls doesn't look silent. The answer to an AskUserQuestion always sends one.                |
| `Notification`: permission prompt, MCP elicitation | `question`, with the notification text as the question                                                                                                                                                                      |
| `Notification`: idle prompt                        | Nothing. `Stop` already said the turn is complete.                                                                                                                                                                          |
| `Stop`                                             | `complete`, with the last assistant message as `summary`, from the hook input or else the transcript. A transcript that can't be read leaves `summary` out.                                                                 |
| `StopFailure`                                      | `error`, with Claude Code's error type as `error.kind`                                                                                                                                                                      |
| `SubagentStart`, `SubagentStop`                    | `working` and `complete` for the subagent, under the parent's `sessionId` with the subagent's `agentId` and type. A stop for a subagent whose start wasn't seen, such as Claude Code's own internal agents, writes nothing. |
| `SessionEnd`                                       | `complete`, the session's last heartbeat                                                                                                                                                                                    |

A liveness heartbeat never follows a finished turn, since a late tool hook is out of order there, and never replaces an AskUserQuestion that is still waiting for its answer, even when a tool running alongside it finishes first.

Every heartbeat also carries the working directory, the repository and branch read from `.git` (without starting `git`), and the hostname.

## Where it writes

Everything lives under `$XDG_STATE_HOME/dash/`, falling back to `~/.local/state/dash/`. Set `DASH_STATE_DIR` to use another directory.

| Path                        | What it holds                                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `outbox/<sessionId>.jsonl`  | One heartbeat per line, each under 4 KB and checked against the standards schema before it is written. The relay reads these files. |
| `sessions/<sessionId>.json` | The session's next `seq`, its agents' last statuses and its model                                                                   |
| `hooks.log`                 | Anything that went wrong, moved to `hooks.log.1` once it passes 1 MB                                                                |

A parent agent and its subagents run hooks as separate processes at the same moment, and they share one `seq` counter. Each heartbeat takes a per-session lock file, reads the counter, appends its line and writes the counter back before releasing it, so no two heartbeats share a `seq` and lines land in `seq` order. A resumed session keeps its session ID and continues from its counter. If the counter file is lost, the next heartbeat continues after the highest `seq` in the outbox file.

A heartbeat that would pass 4 KB once encoded loses detail step by step until it fits: option descriptions first, then shorter text. Text is trimmed by `String.length`, keeping the start and ending with `…`.

On `SessionStart` the hooks delete outbox files nobody has written to for 7 days (`DASH_OUTBOX_RETENTION_DAYS` changes it) and counter files after 180 days.

## Cost per hook

Each hook is a short-lived Node process. On an Apple-silicon Mac it takes about 50 ms, of which about 19 ms is starting Node and about 30 ms is loading Zod and the standards schemas; the lock, the counter and the append take about 1 ms. `PostToolUse` runs as an async hook, so it adds nothing to a tool call's wait; the other hooks run inline so their heartbeats keep their order.

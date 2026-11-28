# @good-ground-collective/dash-hooks

Claude Code hooks that turn session events into [`agent.heartbeat`](../standards/README.md#agent-heartbeats) messages and append them to a local outbox. A relay sends the outbox to Mission Control later, so a heartbeat survives Mission Control restarting or the laptop going offline.

The package has two commands. `dash-hooks <event>` reads the hook payload Claude Code writes to stdin. It never fails the session: whatever goes wrong, it prints nothing, exits 0 and writes the error to a log file. `dash-hooks relay` sends the outbox to Mission Control; the hooks start it in the background (see [Sending the outbox to Mission Control](#sending-the-outbox-to-mission-control)).

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

| Claude Code event                                  | Heartbeat                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SessionStart`                                     | `complete`, the session's first heartbeat: idle until a prompt arrives. After a compaction, which can happen mid-turn, `working`. The model it reports is carried on the main agent's later heartbeats.                                                                                                                                                                                                                                                                                                                                                                        |
| `UserPromptSubmit`                                 | `working`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `PreToolUse` on `AskUserQuestion`                  | `question`, with the question and its options copied verbatim. When it asks several questions at once, their texts are joined and the options left out.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `PostToolUse`                                      | `working`, as a liveness heartbeat: at most one a minute per session while the agent is already working, so a long run of tool calls doesn't look silent. The answer to an AskUserQuestion sends one while that question is still the open one.                                                                                                                                                                                                                                                                                                                                |
| `Notification`: permission prompt, MCP elicitation | `question`, with the notification text as the question                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `Notification`: idle prompt                        | Nothing. `Stop` already said the turn is complete.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `Stop`                                             | `complete`, with the last assistant message as `summary`, from the hook input or else the transcript. A transcript that can't be read leaves `summary` out. Claude Code's `background_tasks` list decides when it is present: non-empty is `waiting` (shell commands, monitors, subagents), and empty is `complete` even if a subagent the main agent launched never reported finishing, which is then forgotten. Only when the list is absent does a subagent the main agent launched in the background that is still running make it `waiting`. Scheduled crons don't count. |
| `StopFailure`                                      | `error`, with Claude Code's error type as `error.kind`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `SubagentStart`, `SubagentStop`                    | `working` and `complete` for the subagent, under the parent's `sessionId` with the subagent's `agentId` and type. A subagent that stops while a subagent it launched in the background is still running is `waiting` instead, and reports `complete` when it stops again with nothing outstanding. A stop for a subagent whose start wasn't seen writes nothing, such as Claude Code's own internal agents, unless a recorded launch named it as a child: that stop is recorded, so its launcher can complete.                                                                 |
| `SessionEnd`                                       | `complete`, the session's last heartbeat                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

A liveness heartbeat never follows a `complete`, `failed` or `error` turn, since a late tool hook is out of order there, but a late tool hook that is not a background launch can move a `waiting` agent back to `working`, even while a child still runs: Claude Code documents no resume event for the main agent, so a tool call is the only sign that waiting work woke it, and that trade-off is kept. A background launch arriving while its launcher is `waiting` on a running child keeps it `waiting`. A liveness heartbeat also never replaces an AskUserQuestion that is still waiting for its answer, even when a tool running alongside it finishes first. `PostToolUse` runs in the background, so an AskUserQuestion's answer can arrive after a newer question or after `Stop`; it is dropped then, rather than marking the agent busy again.

An agent's background children are learned from `PostToolUse` on the `Agent` tool (`Task` in older Claude Code versions) when its response says the launch was asynchronous: the launching agent's ID and the child's ID are the only parent link Claude Code reports. A child counts as running until its own status is `complete`, `failed` or `error`, including before its own start is seen. `PostToolUse` runs in the background, so a launch can be recorded after its launcher already reported `complete`; the launcher then moves to `waiting`, unless the session has ended. Background shell commands a subagent starts have no completion signal Claude Code attributes to that subagent, so they don't hold it in `waiting`. A launching subagent that Claude Code does not run again after its child finishes stays `waiting`: Claude Code normally resumes it with a task notification, which fires another `SubagentStop`, but the hooks reference doesn't guarantee it, and a stale `waiting` is left to the watchdog.

Every heartbeat also carries the working directory, the repository and branch read from `.git` (without starting `git`), and the hostname.

## Where it writes

Everything lives under `$XDG_STATE_HOME/dash/`, falling back to `~/.local/state/dash/`. Set `DASH_STATE_DIR` to use another directory. Both variables are ignored unless they hold an absolute path, so `DASH_STATE_DIR=./state` leaves the hooks writing to the default directory.

| Path                        | What it holds                                                                                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `outbox/<sessionId>.jsonl`  | One heartbeat per line, each under 4 KB and checked against the standards schema before it is written. The relay reads these files.                         |
| `sessions/<sessionId>.json` | The session's next `seq`, its agents' last statuses, the background subagents each agent launched that haven't finished, its model and whether it has ended |
| `hooks.log`                 | Anything that went wrong, moved to `hooks.log.1` once it passes 1 MB                                                                                        |

A parent agent and its subagents run hooks as separate processes at the same moment, and they share one `seq` counter. Each heartbeat takes a per-session lock file, reads the counter, appends its line and writes the counter back before releasing it, so no two heartbeats share a `seq` and lines land in `seq` order. A resumed session keeps its session ID and continues from its counter. If the counter file is lost, the next heartbeat continues after the highest `seq` in the outbox file.

A heartbeat that would pass 4 KB once encoded loses detail step by step until it fits: option descriptions first, then shorter text. Text is trimmed by `String.length`, keeping the start and ending with `…`.

On `SessionStart` the hooks delete outbox files nobody has written to for 7 days (`DASH_OUTBOX_RETENTION_DAYS` changes it) and counter files after 180 days.

## Sending the outbox to Mission Control

`dash-hooks relay` sends the outbox to Mission Control's batch ingest route (`POST /api/agents/<reporterName>/heartbeats/batch`), up to 100 heartbeats a request, in `seq` order within each session. There is nothing to install for it: after a hook writes a heartbeat, it starts a detached relay if none is running. The relay exits once every outbox is delivered and nothing new has arrived for 30 seconds (`DASH_RELAY_IDLE_MS` changes it), and the next hook starts another.

It needs Dash's API URL, a service account key with `heartbeat:write`, and the agent name that key reports as. Put them in `$XDG_CONFIG_HOME/dash/hooks.json` (by default `~/.config/dash/hooks.json`), readable only by you:

```json
{
  "apiUrl": "https://dash.example.com",
  "apiKey": "dash_live_…",
  "reporterName": "seth-laptop"
}
```

```sh
chmod 600 ~/.config/dash/hooks.json
```

`DASH_API_URL`, `DASH_API_KEY` and `DASH_REPORTER_NAME` override the file field by field. With neither, the hooks start no relay. The relay refuses a file that group or others can read, and it never writes the key to its log.

How it behaves:

- **Acknowledged means answered.** After each batch, the relay moves the session's cursor in `relay/<sessionId>.json` past every line Mission Control answered for, whether `created`, `duplicate` or `invalid`. A line it rejects as `invalid`, or one that isn't JSON, is written to `relay.log` and passed over so it can't hold up the rest. A line still being written is left for the next read.
- **Resending is safe.** A relay killed between sending a batch and saving its cursor sends that batch again, and Mission Control answers `duplicate` for anything it already stored under `(sessionId, seq)`.
- **Outages.** While Mission Control is unreachable or answering 5xx, the relay keeps the heartbeats in the outbox and retries, waiting twice as long after each failure, up to 5 minutes. It logs the first failure in a row, not every retry. It never drops a heartbeat itself; the outbox retention above is the only thing that does.
- **A refused key stops it.** On a 401 or 403 it logs why, writes `relay-halted.json`, and exits. Hooks start no relay for that key, URL and reporter name again until one of them changes, or until you delete `relay-halted.json` after fixing the key's account in Dash.
- **One at a time.** `relay.pid` holds the running relay's process ID. A relay that finds a live one exits at once, and one that finds a dead one takes over.
- **Housekeeping.** Once a session has ended (its last heartbeat came from `SessionEnd`) and its outbox is fully delivered, the relay deletes the outbox and its cursor. A session resumed later starts a new outbox file and carries on from its `seq` counter.

| Path                     | What it holds                                                    |
| ------------------------ | ---------------------------------------------------------------- |
| `relay/<sessionId>.json` | How far Mission Control has acknowledged the session's outbox    |
| `relay.pid`              | The running relay's process ID                                   |
| `relay-halted.json`      | A fingerprint of the configuration Mission Control refused       |
| `relay.log`              | What went wrong while relaying, moved to `relay.log.1` past 1 MB |

## Using it as a library

The package's job is the `dash-hooks` command. Its only export is `HooksConfig`, for a reader such as the relay that needs the same state directory layout: `HooksConfig.fromEnvironment()` resolves the directory as the hooks do, and `outboxDirectory`, `sessionsDirectory` and `logPath` name what is inside it. Everything else is internal and can change in any release.

## Cost per hook

Each hook is a short-lived Node process. On an Apple-silicon Mac it takes about 50 ms, of which about 19 ms is starting Node and about 30 ms is loading Zod and the standards schemas; the lock, the counter and the append take about 1 ms. `PostToolUse` runs as an async hook, so it adds nothing to a tool call's wait; the other hooks run inline so their heartbeats keep their order.

Checking whether a relay is running, which every hook that writes a heartbeat does, takes under 0.1 ms. When none is, the hook starts one as a detached process and doesn't wait for it.

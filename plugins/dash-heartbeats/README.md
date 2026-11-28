# dash-heartbeats

A Claude Code plugin that reports every session to Dash. On each session event it runs [`@good-ground-collective/dash-hooks`](../../packages/hooks/README.md), which appends an `agent.heartbeat` line to the local outbox under `~/.local/state/dash/` and starts the relay that sends the outbox to Mission Control.

## Install

The package comes from GitHub Packages, which needs a token with `read:packages` in your user `~/.npmrc`, even though the package is public:

```sh
echo '//npm.pkg.github.com/:_authToken=<token>' >> ~/.npmrc
```

Then, in Claude Code:

```
/plugin marketplace add Good-Ground-Collective/dash
/plugin install dash-heartbeats@dash
```

## How it works

The plugin carries no code of its own. `package.json` pins the `dash-hooks` version, and `scripts/dash-hooks.sh` installs it into the plugin's data directory (`${CLAUDE_PLUGIN_DATA}`) on the first `SessionStart` after that pin changes, then runs it for every hook in `hooks/hooks.json`. The first session after installing or updating the plugin waits a few seconds for that install; `install.log` in the data directory records it. Until the package is installed, or if the install fails, every hook does nothing and the session carries on.

Claude Code updates an installed plugin only when `version` in `.claude-plugin/plugin.json` changes, so raising the pin also means setting that `version` to the pinned release (or a later patch). A test in `packages/hooks` keeps the two in step.

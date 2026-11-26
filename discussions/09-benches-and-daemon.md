# 09 · Benches and the daemon (slice 3)

## What we know
- A **bench** is a machine.
- The daemon reports system info, utilisation (CPU, RAM, disk, network), the processes you care about (herdr, claude, codex, docker, and so on) and harness versions. It also forwards heartbeats.
- Settings screens extend to API keys and Claude OAuth tokens for sessions.

## Questions
1. **Pairing:** how does a new machine get its service account? A device-code pair flow, or a key pasted in? (Ties to #1 (concluded).)
2. **Process watch list:** configured per bench in Dash and pushed to the daemon, or a local config file?
3. **Sampling:** how often for metrics (every 15–60 s?), and how much history do we keep (rollups)?
4. **Harness version matrix** (as in Bench): detect installed versions, compare with the latest, and offer an update button? Is updating in scope, or is it read-only?
5. **Secrets on benches:** storing provider keys or Claude OAuth tokens centrally is a big security step. Where do they live, how are they encrypted, and who can read them back?
6. **Service manager:** launchd and systemd install via `bench-daemon install`.
7. **Offline:** buffer and backfill, or drop metrics but keep heartbeats?
8. **Agents on a bench:** a bench key can report heartbeats under any agent name today, including agents with their own service accounts (accepted when #45 merged). How do we register which agents belong to a bench, so Dash can reject names outside that list?

## Done when
The pairing model, metric set, retention and secret-handling stance are agreed.

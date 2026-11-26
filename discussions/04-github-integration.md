# 04 · GitHub integration (slice 1)

## Why now
Slice 1 needs at least one real feed, and this is it.

## What slice 1 shows (strawman)
- My open PRs, with checks, review state and mergeability
- PRs requesting my review
- Recent Actions runs on my repos, failures first
- Notifications, read-only at first
- Issues assigned to me, plus GitHub Projects items for Dash itself

## Decisions
1. **GitHub App or OAuth App?** An App gives fine-grained permissions, webhooks and higher rate limits. The catch: notifications are user-scoped and need a user token. A GitHub App's user-to-server token can't read notifications, so we'd need OAuth or a classic/fine-grained PAT for that piece (to verify). Strawman: a **GitHub App for repos and webhooks, plus a user token for notifications.**
2. **Webhooks or polling?** Webhooks need a public endpoint, which Fly gives us. Polling is simpler at first. Strawman: webhooks for PRs and checks, polling for notifications (GitHub's notification API supports `If-Modified-Since` and a poll interval).
3. **Store or proxy?** Do we store a copy in Postgres, which lets us query, group and build a Today view, or call through with a cache? Strawman: store PRs and runs, and let the cache cover the rest.
4. **Which orgs?** GGC plus your personal account to start. Work orgs come later, after checking each org's policy on third-party apps.
5. **Actions:** read-only, or allow re-run and merge from Dash? Strawman: read-only in slice 1.

## Done when
The auth model, sync model and v1 feed list are agreed, and the issues are written.

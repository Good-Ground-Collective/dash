# 01 · Identity: users, service accounts, passkeys

## Why now
The onboarding design and Mission Control's data model both depend on what a "user" and a "service account" are and how each one proves who it is.

## What we know
- **Users** are humans. Today that's just you, but don't design that in.
- **Service accounts** are non-human principals. Each machine or agent holds an API key for one. Heartbeats, machine telemetry and, later, factory runs all authenticate as a service account.
- You want **native passkeys**.
- FusionAuth is on the table. Lucia is no longer an option: it was deprecated in 2025 and now exists only as a guide to rolling your own.
- GitHub is something you **connect**, not something you log in with (see [04](./04-github-integration.md)).

## Starting recommendation
Use **Better Auth** inside Mission Control:
- its passkey plugin (WebAuthn, built on SimpleWebAuthn)
- its API-key plugin for service accounts
- a Postgres adapter

Avoid FusionAuth for now. It's a whole extra deployment for one user, and its WebAuthn/passkey features may sit behind a paid plan (to verify). The fallback is to roll our own: `@simplewebauthn/server` plus sessions in Postgres. That's around 300 lines, and every one of them is ours to maintain.

Proposed model:

```
principal   id, kind (user | service), name, created_at, disabled_at
user        principal_id, email?, display_name
passkey     user_id, credential_id, public_key, counter, transports, device_name, last_used_at
session     user_id, token_hash, expires_at
service     principal_id, owner_user_id, bench_id?, description
api_key     service_id, prefix, hash, scopes[], expires_at?, last_used_at, revoked_at
```

Users and services share a `principal`, so audit logs and "who did this" work the same way for both.

## Passkey logistics to settle
1. **Relying Party ID = domain.** A passkey is bound to the domain it was registered on. The domain is **`dash.doublel.studio`**. Do we set the RP ID to `dash.doublel.studio`, or to the parent `doublel.studio`? The parent lets passkeys survive a move to another subdomain, but it also trusts every other subdomain.
2. **Bootstrapping the first user.** With no passwords, what lets you create the first account? Options: a one-time setup token printed on first boot, or an `INITIAL_ADMIN_EMAIL` env var plus a magic link.
3. **Recovery.** A lost device can't mean a lost account. Options: more than one passkey per user (encouraged during onboarding), one-time recovery codes, or a CLI `dash admin issue-recovery` that runs against the DB.
4. **Passkey-only or with a fallback?** Is there an email magic link as a backup? Which mail provider would send it?
5. **Local dev.** WebAuthn works on `localhost`. A tailnet hostname needs HTTPS (Tailscale certs).

## Service account questions
1. **Granularity:** one service account per machine (a bench) or per agent? My lean is **per bench**, with the agent identity carried inside the payload. Then revoking a machine is a single action, and agents stay cheap to create.
2. **Scopes:** do we start with a couple, say `heartbeat:write` and `telemetry:write`, and grow them later?
3. **Key format:** `dash_<env>_<prefix>_<secret>`? Store only a hash, show the key once, and make it greppable for secret scanning.
4. **Rotation:** expiry, with overlap during rotation?
5. **Issuing:** in the UI, or via a daemon `pair` flow where the machine shows a code and you approve it in Dash (a device-code flow)? Kitze's Bench has a "Pair" button.

## Out of scope
Multi-tenant or organisation support, and downstream mirrors of the standards. Leave room for both, don't build either.

## Done when
- the principal/user/service model is agreed
- the auth library is chosen
- the bootstrap and recovery approach is picked
- key format and scopes are picked
- the pair flow is decided (now or later)

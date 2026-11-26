<script lang="ts">
  import '#lib/auth-ui/auth-form.css';
  import { invalidateAll } from '$app/navigation';
  import { API_BASE_URL } from '$app/env/public';
  import { MissionControlError } from '#lib/api/mission-control-error.ts';
  import {
    type NewServiceAccount,
    type ServiceAccount,
  } from '#lib/api/service-account-contracts.ts';
  import { HttpServiceAccounts } from '#lib/api/service-accounts.ts';
  import { HttpPasskeyAuth } from '#lib/auth/passkey-auth.ts';
  import { passkeyWording } from '#lib/auth/passkey-wording.ts';
  import ConfirmDialog from '#lib/service-accounts-ui/ConfirmDialog.svelte';
  import CreateServiceAccountDialog from '#lib/service-accounts-ui/CreateServiceAccountDialog.svelte';
  import KeyRevealDialog from '#lib/service-accounts-ui/KeyRevealDialog.svelte';
  import { serviceAccountWording as wording } from '#lib/service-accounts/service-account-wording.ts';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const accounts = HttpServiceAccounts.inBrowser({ baseUrl: API_BASE_URL });
  const auth = HttpPasskeyAuth.inBrowser({ baseUrl: API_BASE_URL });

  let busy = $state(false);
  let error = $state<string | null>(null);
  let creating = $state(false);
  let createError = $state<string | null>(null);
  let pending = $state<(() => Promise<void>) | null>(null);
  let revealed = $state<{ secret: string; accountName: string } | null>(null);
  let now = $state(new Date());

  let serviceAccounts: ServiceAccount[] = $derived(data.serviceAccounts ?? []);

  /** Runs a change. A stale session parks it for `confirmAndRetry`; other failures land in `report`, the page's error line unless told otherwise. */
  const change = async (
    action: () => Promise<void>,
    report: (message: string) => void = (message) => (error = message),
  ): Promise<void> => {
    busy = true;
    error = null;
    try {
      await action();
      pending = null;
      now = new Date();
      await invalidateAll();
    } catch (cause) {
      if (
        cause instanceof MissionControlError &&
        cause.code === 'SESSION_NOT_FRESH'
      ) {
        creating = false;
        pending = action;
      } else if (passkeyWording.isCancellation(cause)) {
        pending = null;
      } else {
        report(wording.explain(cause));
      }
    } finally {
      busy = false;
    }
  };

  const confirmAndRetry = async (): Promise<void> => {
    const retry = pending;
    if (retry === null) return;
    await change(async () => {
      await auth.signIn({ autofill: false });
      await retry();
    });
  };

  /** The dialog stays open until Mission Control creates the account, so a refusal doesn't lose what was typed. A stale session closes it; the retry replays `input`. */
  const create = (input: NewServiceAccount): void => {
    createError = null;
    void change(
      async () => {
        const created = await accounts.create(input);
        creating = false;
        revealed = {
          secret: created.apiKey.secret,
          accountName: created.serviceAccount.name,
        };
      },
      (message) => (createError = message),
    );
  };

  const issueKey = (account: ServiceAccount): void => {
    void change(async () => {
      const issued = await accounts.issueKey({ serviceAccountId: account.id });
      revealed = { secret: issued.secret, accountName: account.name };
    });
  };

  $effect(() => {
    if (!creating) createError = null;
  });
</script>

<svelte:head>
  <title>Service accounts · Dash</title>
</svelte:head>

<section class="page" aria-labelledby="service-accounts-title">
  <a class="back" href="/settings">Settings</a>
  <header class="heading">
    <div>
      <h1 id="service-accounts-title">Service accounts</h1>
      <p class="muted">
        Benches and agents report to Dash with API keys. A bench key reports for
        any agent on that machine; an agent key reports only as itself.
      </p>
    </div>
    <CreateServiceAccountDialog
      bind:open={creating}
      {busy}
      error={createError}
      onCreate={create}
    />
  </header>

  {#if pending}
    <div class="auth-notice reauth" role="alert">
      <span>
        Confirm it’s you. Changing service accounts needs a sign-in from the
        last 15 minutes.
      </span>
      <button class="auth-button" disabled={busy} onclick={confirmAndRetry}>
        Confirm with a passkey
      </button>
    </div>
  {/if}
  {#if error}
    <p class="auth-error" role="alert">{error}</p>
  {/if}

  {#if data.serviceAccounts === null}
    <p class="panel muted">
      Mission Control didn’t list your service accounts. Reload to try again.
    </p>
  {:else if serviceAccounts.length === 0}
    <div class="panel empty">
      <h2>No service accounts yet</h2>
      <p class="muted">
        Create one for each bench that runs agents, so they can send heartbeats.
      </p>
    </div>
  {:else}
    <ul class="accounts" aria-label="Service accounts">
      {#each serviceAccounts as account (account.id)}
        <li class="panel account">
          <div class="account-head">
            <div class="account-title">
              <h2>{account.name}</h2>
              <span class="badge {account.kind}">
                {account.kind === 'bench' ? 'Bench' : 'Agent'}
              </span>
              <code>{account.benchId ?? account.agentName}</code>
            </div>
            <div class="row-actions">
              <button
                class="auth-button quiet small"
                disabled={busy}
                onclick={() => issueKey(account)}
                aria-label={`New key for ${account.name}`}
              >
                New key
              </button>
              <ConfirmDialog
                triggerLabel="Remove"
                triggerAriaLabel={`Remove ${account.name}`}
                title={`Remove “${account.name}”?`}
                description="Every key it holds stops working at once. Heartbeats it already sent are kept."
                confirmLabel="Remove account"
                disabled={busy}
                onConfirm={() =>
                  change(() =>
                    accounts.revokeAccount({ serviceAccountId: account.id }),
                  )}
              />
            </div>
          </div>
          <p class="muted detail">
            {account.description} · {wording.used(
              wording.lastUsed(account),
              now,
            )}
          </p>
          <p class="detail account-scopes">
            <span class="muted">Keys may</span>
            {#each account.scopes as scope (scope)}
              <span class="scope">{wording.scopeLabel(scope)}</span>
            {/each}
          </p>

          {#if account.keys.length === 0}
            <p class="muted detail">
              No keys. Issue one to let it report again.
            </p>
          {:else}
            <ul class="keys" aria-label={`Keys for ${account.name}`}>
              {#each account.keys as key (key.id)}
                <li>
                  <div class="key">
                    <code class="start">{wording.start(key)}</code>
                    <span class="scopes">
                      {#each key.scopes as scope (scope)}
                        <span class="scope">{wording.scopeLabel(scope)}</span>
                      {/each}
                    </span>
                    <span class="muted detail">
                      {wording.used(key.lastUsedAt, now)} · {wording.expiry(
                        key,
                        now,
                      )}
                    </span>
                  </div>
                  <ConfirmDialog
                    triggerLabel="Revoke"
                    triggerAriaLabel={`Revoke ${wording.start(key)}`}
                    title={`Revoke ${wording.start(key)}?`}
                    description={`It stops working at once. Anything on ${account.name} still using it will be refused.`}
                    confirmLabel="Revoke key"
                    disabled={busy}
                    onConfirm={() =>
                      change(() => accounts.revokeKey({ keyId: key.id }))}
                  />
                </li>
              {/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<KeyRevealDialog
  secret={revealed?.secret ?? null}
  accountName={revealed?.accountName ?? ''}
  onDone={() => (revealed = null)}
/>

<style>
  .page {
    display: grid;
    gap: var(--space-5);
    max-width: 52rem;
  }

  .back {
    justify-self: start;
    font-size: var(--font-size-sm);
    color: var(--ink-muted);
    text-decoration: none;
  }

  .back::before {
    content: '← ';
  }

  .back:hover {
    color: var(--ink);
  }

  .heading {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .heading > div {
    display: grid;
    flex: 1 1 24rem;
    gap: var(--space-1);
  }

  h1 {
    font-family: var(--font-display);
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    letter-spacing: -0.015em;
    line-height: var(--line-height-tight);
  }

  h2 {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
  }

  .muted {
    color: var(--ink-muted);
  }

  .detail {
    font-size: var(--font-size-sm);
  }

  .reauth {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .panel {
    padding: var(--space-5);
    background: var(--surface);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-panel);
  }

  .empty {
    display: grid;
    gap: var(--space-1);
  }

  .accounts {
    display: grid;
    gap: var(--space-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .account {
    display: grid;
    gap: var(--space-3);
  }

  .account-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .account-title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }

  code {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
  }

  .account-title code {
    color: var(--ink-muted);
  }

  .badge,
  .scope {
    padding: 2px var(--space-2);
    border-radius: var(--radius-pill);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
  }

  .badge.bench {
    background: var(--char-blue-bg);
    color: var(--char-blue-fg);
  }

  .badge.agent {
    background: var(--char-violet-bg);
    color: var(--char-violet-fg);
  }

  .scope {
    background: var(--char-neutral-bg);
    color: var(--char-neutral-fg);
  }

  .row-actions {
    display: flex;
    gap: var(--space-2);
  }

  .keys {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-control);
  }

  .keys li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
  }

  .keys li + li {
    border-top: var(--border-hairline) solid var(--line);
  }

  .key {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
  }

  .scopes,
  .account-scopes {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
  }

  :global(.auth-button.small) {
    min-height: 2.25rem;
    padding: 0 var(--space-3);
    font-size: var(--font-size-sm);
  }
</style>

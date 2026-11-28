<script lang="ts">
  import '#lib/auth-ui/auth-form.css';
  import { goto, invalidateAll } from '$app/navigation';
  import { API_BASE_URL } from '$app/env/public';
  import type { Passkey } from '#lib/api/mission-control.ts';
  import { HttpPasskeyAuth } from '#lib/auth/passkey-auth.ts';
  import { PasskeyAuthError } from '#lib/auth/passkey-auth-error.ts';
  import { passkeyWording } from '#lib/auth/passkey-wording.ts';
  import PasskeyNameForm from '#lib/auth-ui/PasskeyNameForm.svelte';
  import RecoveryCodesPanel from '#lib/auth-ui/RecoveryCodesPanel.svelte';
  import RemovePasskeyDialog from '#lib/auth-ui/RemovePasskeyDialog.svelte';
  import AppearanceSettings from '#lib/theme-ui/AppearanceSettings.svelte';
  import AccountPanels from '#lib/auth-ui/AccountPanels.svelte';
  import GithubConnectionsPanel from '#lib/connections-ui/GithubConnectionsPanel.svelte';
  import TimeZonePanel from '#lib/time-zone-ui/TimeZonePanel.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const auth = HttpPasskeyAuth.inBrowser({ baseUrl: API_BASE_URL });

  let busy = $state(false);
  let error = $state<string | null>(null);
  let newName = $state('');
  let renamingId = $state<string | null>(null);
  let renameTo = $state('');
  let pending = $state<(() => Promise<void>) | null>(null);

  let passkeys: Passkey[] = $derived(data.passkeys ?? []);
  let onlyOne = $derived(passkeys.length <= 1);

  const change = async (action: () => Promise<void>): Promise<void> => {
    busy = true;
    error = null;
    try {
      await action();
      pending = null;
      await invalidateAll();
    } catch (cause) {
      if (
        cause instanceof PasskeyAuthError &&
        cause.code === 'SESSION_NOT_FRESH'
      ) {
        pending = action;
      } else if (!passkeyWording.isCancellation(cause)) {
        error = passkeyWording.explain(cause);
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

  const add = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    const name = newName.trim();
    await change(async () => {
      await auth.addPasskey({ name });
      newName = '';
    });
  };

  const rename = async (id: string, name: string): Promise<void> => {
    await change(async () => {
      await auth.renamePasskey({ id, name });
      renamingId = null;
    });
  };

  const signOut = async (): Promise<void> => {
    await auth.signOut();
    await goto('/sign-in', { invalidateAll: true });
  };
</script>

<svelte:head>
  <title>Settings · Dash</title>
</svelte:head>

<section class="settings" aria-labelledby="settings-title">
  <h1 id="settings-title">Settings</h1>

  <section class="panel" aria-labelledby="passkeys-title">
    <header>
      <h2 id="passkeys-title">Passkeys</h2>
      <p class="muted">
        Passkeys are how you sign in to Dash. Keep at least two, on different
        devices, so losing one doesn’t lock you out.
      </p>
    </header>

    {#if pending}
      <div class="auth-notice reauth" role="alert">
        <span>
          Confirm it’s you. Changing passkeys needs a sign-in from the last 15
          minutes.
        </span>
        <button class="auth-button" disabled={busy} onclick={confirmAndRetry}>
          Confirm with a passkey
        </button>
      </div>
    {/if}
    {#if error}
      <p class="auth-error" role="alert">{error}</p>
    {/if}

    {#if data.passkeys === null}
      <p class="muted">
        Mission Control didn’t list your passkeys. Reload to try again.
      </p>
    {:else}
      <ul class="passkeys" aria-label="Your passkeys">
        {#each passkeys as passkey (passkey.id)}
          <li>
            {#if renamingId === passkey.id}
              <PasskeyNameForm
                label={`New name for ${passkeyWording.label(passkey)}`}
                labelHidden
                bind:value={renameTo}
                {busy}
                onSave={(name) => rename(passkey.id, name)}
                onCancel={() => (renamingId = null)}
              />
            {:else}
              <div class="passkey">
                <span class="name">{passkeyWording.label(passkey)}</span>
                <span class="muted detail">
                  {passkeyWording.detail(passkey)}
                </span>
              </div>
              <div class="row-actions">
                <button
                  class="auth-button quiet small"
                  disabled={busy}
                  onclick={() => {
                    renamingId = passkey.id;
                    renameTo = passkey.name ?? '';
                  }}
                  aria-label={`Rename ${passkeyWording.label(passkey)}`}
                >
                  Rename
                </button>
                <RemovePasskeyDialog
                  label={passkeyWording.label(passkey)}
                  disabled={busy || onlyOne}
                  onConfirm={() =>
                    change(() => auth.removePasskey({ id: passkey.id }))}
                />
              </div>
            {/if}
          </li>
        {/each}
      </ul>
      {#if onlyOne}
        <p class="muted small-print">
          Your only passkey can’t be removed. Add another first.
        </p>
      {/if}
    {/if}

    <form class="add" onsubmit={add}>
      <div class="auth-field">
        <label for="new-passkey-name">Add a passkey</label>
        <input
          id="new-passkey-name"
          bind:value={newName}
          placeholder="Name it after the device, like “Work laptop”"
          required
        />
      </div>
      <button class="auth-button" type="submit" disabled={busy}>
        Add passkey
      </button>
    </form>
  </section>

  <RecoveryCodesPanel status={data.recoveryCodes} />

  <AppearanceSettings />

  <TimeZonePanel timeZone={data.viewer.timeZone} />

  <GithubConnectionsPanel github={data.github} />

  <AccountPanels viewer={data.viewer} onSignOut={signOut} />
</section>

<style>
  .settings {
    display: grid;
    gap: var(--space-5);
    max-width: 44rem;
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

  .panel {
    display: grid;
    gap: var(--space-4);
    padding: var(--density-panel);
    background: var(--surface);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-panel);
  }

  .muted {
    color: var(--ink-muted);
  }

  header .muted {
    margin-top: var(--space-1);
  }

  .reauth {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .passkeys {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-control);
  }

  .passkeys li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--density-row-block) var(--density-row-inline);
  }

  .passkeys li + li {
    border-top: var(--border-hairline) solid var(--line);
  }

  .passkey {
    display: grid;
    gap: 2px;
  }

  .name {
    font-weight: var(--font-weight-medium);
  }

  .detail,
  .small-print {
    font-size: var(--font-size-sm);
  }

  .row-actions {
    display: flex;
    gap: var(--space-2);
  }

  .add {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--space-3);
  }

  .add .auth-field {
    flex: 1 1 16rem;
  }
</style>

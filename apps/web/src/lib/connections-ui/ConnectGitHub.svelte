<script lang="ts">
  import '#lib/auth-ui/auth-form.css';
  import { onMount, tick } from 'svelte';
  import type { GithubAccountReads } from '#lib/api/github-accounts.ts';
  import {
    ConnectGithubFlow,
    type ConnectGithubState,
  } from '#lib/connections/connect-github-flow.ts';
  import type { ConnectResult } from '#lib/connections/connect-results.ts';
  import { GithubAccountRows } from '#lib/connections/github-account-rows.ts';
  import GithubAccountRow from '#lib/connections-ui/GithubAccountRow.svelte';

  let {
    accounts,
    returnTo,
    result = null,
  }: {
    accounts: GithubAccountReads;
    /** The web path GitHub's redirects come back to, such as `/setup/github`. */
    returnTo: string;
    /** What the last trip to GitHub did, shown above the list. */
    result?: ConnectResult | null;
  } = $props();

  let flow = $derived(new ConnectGithubFlow({ accounts, returnTo }));

  let current = $state<ConnectGithubState>(ConnectGithubFlow.start());
  let busy = $state(false);
  let summary = $state('');
  let region = $state<HTMLElement>();

  let rows = $derived(
    current.state === 'linked'
      ? current.accounts.map((entry) => GithubAccountRows.view(entry))
      : [],
  );

  /**
   * Loads the list. A quiet reload, as when the tab comes back into view, keeps what's shown
   * until the answer arrives. After Try again, focus moves to the list so it's announced.
   */
  const load = async (props: { quiet: boolean; refocus: boolean }) => {
    if (busy) return;
    busy = true;
    if (!props.quiet) current = ConnectGithubFlow.start();

    const next = await flow.load();
    if (!(props.quiet && next.state === 'failed')) current = next;
    busy = false;

    summary = ConnectGithubFlow.summary(current);
    if (props.refocus && current.state !== 'failed') {
      await tick();
      region?.focus();
    }
  };

  /** Links expire after ten minutes, and an install made in another tab should show up. */
  const refreshWhenVisible = () => {
    if (document.visibilityState === 'visible' && current.state !== 'loading') {
      void load({ quiet: true, refocus: false });
    }
  };

  onMount(() => {
    void load({ quiet: false, refocus: false });
  });
</script>

<svelte:document onvisibilitychange={refreshWhenVisible} />

<div class="connect">
  <div role="status" class="result-region">
    {#if result !== null && result.tone !== 'bad'}
      <p class="banner {result.tone}">{result.message}</p>
    {/if}
  </div>
  <div role="alert" class="result-region">
    {#if result?.tone === 'bad'}
      <p class="auth-error">{result.message}</p>
    {/if}
  </div>
  <p class="visually-hidden" role="status">{summary}</p>

  <section
    class="accounts"
    aria-label="GitHub accounts"
    aria-busy={current.state === 'loading'}
    tabindex="-1"
    bind:this={region}
  >
    {#if current.state === 'loading'}
      <p class="muted">Loading your GitHub accounts…</p>
    {:else if current.state === 'authorize'}
      <a class="auth-button" href={current.authorizeUrl}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.56 9.56 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"
          />
        </svg>
        Connect GitHub
      </a>
      <p class="hint">
        GitHub asks you to authorize Dash, then you choose the accounts it can
        read.
      </p>
    {:else if current.state === 'linked'}
      {#if rows.length > 0}
        <ul class="list">
          {#each rows as row (row.login)}
            <GithubAccountRow {row} />
          {/each}
        </ul>
      {:else}
        <p class="muted">GitHub didn’t list any accounts yet.</p>
      {/if}
      <a class="auth-button quiet add" href={current.addAccountUrl}>
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add another account
      </a>
      <p class="hint">
        GitHub lists every account you can install the app on. Where you’re a
        member, you can ask an owner to install it.
      </p>
    {:else if current.state === 'signed-out'}
      <p class="auth-error" role="alert">
        Your Dash session ended. Sign in to continue.
      </p>
      <a class="auth-button quiet" href="/sign-in">Sign in</a>
    {:else}
      <p class="auth-error" role="alert">{current.error}</p>
      <button
        class="auth-button quiet"
        type="button"
        disabled={busy}
        onclick={() => load({ quiet: false, refocus: true })}
      >
        Try again
      </button>
    {/if}
  </section>
</div>

<style>
  .connect,
  .accounts {
    display: grid;
    gap: var(--space-3);
  }

  .accounts:focus {
    outline: none;
  }

  .result-region:empty {
    display: none;
  }

  .banner {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-control);
    font-size: var(--font-size-sm);
  }

  .banner.ok {
    background: var(--ok-surface);
    color: var(--ok);
  }

  .banner.info {
    border: var(--border-hairline) solid var(--line);
    background: var(--bg);
    color: var(--ink);
  }

  .list {
    margin: 0;
    padding: 0;
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-control);
    list-style: none;
  }

  a.auth-button {
    text-decoration: none;
  }

  .add {
    justify-self: start;
  }

  .hint,
  .muted {
    font-size: var(--font-size-xs);
    line-height: var(--line-height-body);
    color: var(--ink-muted);
  }

  .muted {
    font-size: var(--font-size-sm);
  }
</style>

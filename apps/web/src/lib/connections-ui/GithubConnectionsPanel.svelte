<script lang="ts">
  import '#lib/auth-ui/auth-form.css';
  import { onMount } from 'svelte';
  import { API_BASE_URL } from '$app/env/public';
  import type { ConnectableAccount } from '#lib/api/github-account-contracts.ts';
  import { HttpGithubAccounts } from '#lib/api/github-accounts.ts';
  import { connectGithubPath } from '#lib/auth/onboarding-route.ts';
  import { ConnectGithubFlow } from '#lib/connections/connect-github-flow.ts';
  import { OwnedConnectionRows } from '#lib/connections/owned-connection-rows.ts';
  import type { GithubFeedState } from '#lib/github-feed/feed-view.ts';

  let { github }: { github: GithubFeedState | null } = $props();

  let accounts = $state<ConnectableAccount[]>([]);
  let addAccountUrl = $state<string | null>(null);

  let rows = $derived(
    github?.status === 'loaded'
      ? OwnedConnectionRows.rows({
          connections: github.feed.connections,
          accounts,
        })
      : [],
  );

  onMount(() => {
    const flow = new ConnectGithubFlow({
      accounts: HttpGithubAccounts.inBrowser({ baseUrl: API_BASE_URL }),
      returnTo: connectGithubPath,
    });
    void flow.load().then((loaded) => {
      if (loaded.state !== 'linked') return;
      accounts = loaded.accounts;
      addAccountUrl = loaded.addAccountUrl;
    });
  });
</script>

<section class="panel" aria-labelledby="connections-title">
  <header>
    <h2 id="connections-title">Connections</h2>
    <p class="muted">
      GitHub accounts Dash reads through the app you installed. Access is
      read-only.
    </p>
  </header>

  {#if github?.status !== 'loaded'}
    <p class="muted">
      Mission Control didn’t list your connections. Reload to try again.
    </p>
  {:else if rows.length === 0}
    <p class="muted">No GitHub accounts are connected yet.</p>
  {:else}
    <ul class="list" aria-label="GitHub installs">
      {#each rows as row (row.id)}
        <li>
          <div class="who">
            <span class="login">{row.login}</span>
            <span class="detail" class:stale={row.stale}>{row.synced}</span>
            {#if row.error !== null}
              <span class="error">{row.error}</span>
            {/if}
          </div>
          {#if row.manageUrl !== null}
            <a class="quiet-link" href={row.manageUrl}>
              Manage on GitHub<span class="visually-hidden"> {row.login}</span>
            </a>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <div class="actions">
    {#if github?.status === 'loaded' && rows.length === 0}
      <a class="auth-button" href={connectGithubPath}>Connect GitHub</a>
    {:else}
      <a
        class="auth-button quiet"
        href={OwnedConnectionRows.addAccountHref(addAccountUrl)}
      >
        Add another account
      </a>
    {/if}
  </div>
  <p class="muted small-print">
    Guest access with a personal access token, for accounts you can’t install
    the app on, is on its way.
  </p>
</section>

<style>
  .panel {
    display: grid;
    gap: var(--space-4);
    padding: var(--density-panel);
    background: var(--surface);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-panel);
  }

  h2 {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
  }

  .muted {
    color: var(--ink-muted);
  }

  header .muted {
    margin-top: var(--space-1);
  }

  .list {
    margin: 0;
    padding: 0;
    list-style: none;
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-control);
  }

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--density-row-block) var(--density-row-inline);
  }

  li + li {
    border-top: var(--border-hairline) solid var(--line);
  }

  .who {
    display: grid;
    flex: 1 1 12rem;
    gap: 2px;
    min-width: 0;
  }

  .login {
    overflow-wrap: anywhere;
    font-weight: var(--font-weight-medium);
  }

  .detail,
  .error,
  .small-print {
    font-size: var(--font-size-sm);
  }

  .detail {
    color: var(--ink-muted);
  }

  .stale,
  .error {
    color: var(--warn);
  }

  .error {
    overflow-wrap: anywhere;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  a.auth-button {
    text-decoration: none;
  }

  .quiet-link {
    display: inline-flex;
    align-items: center;
    min-height: var(--touch-target);
    color: var(--ink-muted);
    font-size: var(--font-size-sm);
  }

  .quiet-link:hover {
    color: var(--ink);
  }
</style>

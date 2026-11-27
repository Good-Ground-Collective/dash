<script lang="ts">
  import type { ConnectionStatus } from '#lib/github-feed/feed-view.ts';

  let { statuses }: { statuses: ConnectionStatus[] } = $props();

  let failing = $derived(statuses.filter((status) => status.error !== null));
</script>

{#each failing as status (status.id)}
  <div class="warning" role="status">
    <p class="title">Dash couldn’t read {status.login}</p>
    <p class="body">{status.error}</p>
    <p class="body">Showing what the last good read found.</p>
  </div>
{/each}

<ul class="statuses" aria-label="Connection freshness">
  {#each statuses as status (status.id)}
    <li class:stale={status.stale}>
      <span class="login">{status.login}</span>
      {#if status.kind === 'guest'}
        <span class="kind">guest</span>
      {/if}
      <span class="synced">{status.synced}</span>
      {#if status.truncated}
        <span class="truncated">
          Showing the most recent items for {status.login}
        </span>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .warning {
    display: grid;
    gap: var(--space-1);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-control);
    background: var(--warn-surface);
  }

  .warning .title {
    color: var(--warn);
    font-weight: var(--font-weight-medium);
  }

  .warning .body {
    overflow-wrap: anywhere;
    font-size: var(--font-size-sm);
  }

  .statuses {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-4);
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
  }

  li {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1);
  }

  .login {
    color: var(--ink);
    font-weight: var(--font-weight-medium);
  }

  .kind {
    padding: 0 var(--space-1);
    border-radius: var(--radius-pill);
    background: var(--faint);
  }

  .truncated {
    flex-basis: 100%;
  }

  .stale .synced {
    color: var(--warn);
  }
</style>

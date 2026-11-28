<script lang="ts">
  import '#lib/auth-ui/auth-form.css';
  import type { GithubFeed } from '#lib/api/github-feed-contracts.ts';
  import type { WatchedChecks } from '#lib/api/watched-checks/watched-checks-contracts.ts';
  import RepositoryChecksDialog from '#lib/watched-checks-ui/RepositoryChecksDialog.svelte';
  import {
    type RepositoryFilter,
    WatchedChecksView,
  } from '#lib/watched-checks/watched-checks-view.ts';

  let {
    feed,
    chosen,
    message,
    messageRepository,
  }: {
    feed: GithubFeed;
    chosen: WatchedChecks;
    message: string | null;
    messageRepository: string | null;
  } = $props();

  let search = $state('');
  let filter = $state<RepositoryFilter>('all');
  let editing = $state<string | null>(null);

  const view = $derived(
    new WatchedChecksView({ feed, chosen, search, filter }),
  );
  const editedBranch = $derived(
    feed.defaultBranches.find(
      (branch) => branch.repository.fullName === editing,
    ),
  );
</script>

<section class="panel" aria-labelledby="repos-title">
  <header>
    <h2 id="repos-title">Repos</h2>
    <p class="muted">
      {view.repositories.length} of {view.repositoryCount} · across {view.accountCount}
      {view.accountCount === 1 ? 'account' : 'accounts'}
    </p>
  </header>

  <div class="controls">
    <div class="auth-field search">
      <label for="repo-search">Search repos</label>
      <input
        id="repo-search"
        type="search"
        bind:value={search}
        placeholder="Search repos"
        autocomplete="off"
        spellcheck="false"
      />
    </div>
    <div class="filters" role="group" aria-label="Filter repos">
      {#each view.filters as option (option.filter)}
        <button
          type="button"
          class="filter"
          aria-pressed={filter === option.filter}
          onclick={() => (filter = option.filter)}
        >
          {option.label}
          <span class="count">{option.count}</span>
        </button>
      {/each}
    </div>
  </div>

  {#if view.repositories.length === 0}
    <p class="muted">
      {view.repositoryCount === 0
        ? 'Dash hasn’t read any default branches yet.'
        : 'No repos match.'}
    </p>
  {:else}
    <table>
      <thead>
        <tr>
          <th scope="col">Repo</th>
          <th scope="col">Watching</th>
          <th scope="col">Watched state</th>
          <th scope="col"><span class="visually-hidden">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        {#each view.repositories as row (row.fullName)}
          <tr>
            <td class="repo">
              <span class="name">
                <span class="owner">{row.owner}/</span>{row.name}
              </span>
              {#if row.custom}
                <span class="custom">custom</span>
              {/if}
            </td>
            <td class="watching" data-label="Watching">{row.watching}</td>
            <td data-label="Watched state">
              <span class={['state', row.watchedState]}>{row.stateLabel}</span>
            </td>
            <td class="action">
              <button
                type="button"
                class="auth-button quiet small edit"
                onclick={() => (editing = row.fullName)}
              >
                Edit<span class="visually-hidden"> {row.fullName}</span>
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

{#if editing !== null && editedBranch !== undefined}
  {#key editing}
    <RepositoryChecksDialog
      branch={editedBranch}
      {chosen}
      message={editing === messageRepository ? message : null}
      onClose={() => (editing = null)}
    />
  {/key}
{/if}

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

  .muted,
  .owner {
    color: var(--ink-muted);
  }

  header .muted {
    margin-top: var(--space-1);
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: var(--space-3);
  }

  .search {
    flex: 1 1 16rem;
  }

  .search label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .filter {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--touch-target);
    padding: 0 var(--space-3);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-pill);
    background: var(--surface);
    color: var(--ink-muted);
    font: inherit;
    cursor: pointer;
  }

  .filter[aria-pressed='true'] {
    border-color: var(--ink);
    background: var(--faint);
    color: var(--ink);
    font-weight: var(--font-weight-medium);
  }

  .count {
    font-size: var(--font-size-xs);
    font-variant-numeric: tabular-nums;
    color: var(--ink-muted);
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th {
    padding: var(--space-2) var(--space-3);
    text-align: left;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  td {
    padding: var(--density-row-block) var(--space-3);
    border-top: var(--border-hairline) solid var(--line);
    vertical-align: middle;
  }

  .repo {
    overflow-wrap: anywhere;
    font-weight: var(--font-weight-medium);
  }

  .custom {
    margin-left: var(--space-2);
    padding: 1px var(--space-2);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-pill);
    font-size: var(--font-size-2xs);
    font-weight: var(--font-weight-medium);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ink-muted);
  }

  .watching {
    overflow-wrap: anywhere;
    color: var(--ink-muted);
  }

  .state {
    font-weight: var(--font-weight-medium);
  }

  .state.failing {
    color: var(--bad);
  }

  .state.pending {
    color: var(--warn);
  }

  .state.passing {
    color: var(--ok);
  }

  .state.none {
    color: var(--ink-muted);
    font-weight: var(--font-weight-regular);
  }

  .action {
    text-align: right;
  }

  .edit {
    min-height: var(--touch-target);
    min-width: var(--touch-target);
  }

  @media (width < 45rem) {
    thead {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }

    table,
    tbody {
      display: grid;
      gap: var(--space-2);
    }

    tr {
      display: grid;
      gap: var(--space-1);
      padding: var(--space-3);
      border: var(--border-hairline) solid var(--line);
      border-radius: var(--radius-control);
    }

    td {
      display: block;
      padding: 0;
      border: 0;
    }

    td[data-label]::before {
      content: attr(data-label) ': ';
      color: var(--ink-muted);
      font-size: var(--font-size-xs);
    }

    .action {
      margin-top: var(--space-2);
      text-align: left;
    }

    .edit {
      width: 100%;
    }
  }
</style>

<script lang="ts">
  import { page } from '$app/state';
  import {
    accountParam,
    GithubFeedView,
    githubPagePath,
  } from '#lib/github-feed/feed-view.ts';
  import AccountFilter from '#lib/github-feed-ui/AccountFilter.svelte';
  import ConnectionStatusList from '#lib/github-feed-ui/ConnectionStatusList.svelte';
  import FeedGroupCard from '#lib/github-feed-ui/FeedGroupCard.svelte';
  import FeedNotice from '#lib/github-feed-ui/FeedNotice.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  let view = $derived(
    data.github.status === 'loaded'
      ? new GithubFeedView({
          feed: data.github.feed,
          account: page.url.searchParams.get(accountParam),
        })
      : null,
  );
</script>

<svelte:head>
  <title>GitHub · Dash</title>
</svelte:head>

<section class="github" aria-labelledby="github-title">
  <header class="intro">
    <h1 id="github-title">GitHub</h1>
    <p class="muted">
      Your GitHub work across every connected account. Rows open on GitHub.
    </p>
  </header>

  {#if view === null}
    <FeedNotice kind="failed" />
  {:else if view.status === 'not-connected'}
    <FeedNotice kind="not-connected" />
  {:else}
    <div class="controls">
      <AccountFilter options={view.accountOptions} />
      {#if view.unknownAccount !== null}
        <p class="muted" role="status">
          No connection is called “{view.unknownAccount}”, so this shows every
          account. <a href={githubPagePath}>Clear the filter</a>
        </p>
      {/if}
      <ConnectionStatusList statuses={view.connectionStatuses} />
    </div>
    {#if view.status === 'first-sync'}
      <FeedNotice kind="first-sync" />
    {:else}
      <div class="groups">
        {#each view.groups as group (group.key)}
          <div class="group-panel">
            <FeedGroupCard {group} />
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</section>

<style>
  .github {
    display: grid;
    gap: var(--space-5);
  }

  .intro {
    display: grid;
    gap: var(--space-1);
  }

  h1 {
    font-family: var(--font-display);
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    letter-spacing: -0.015em;
    line-height: var(--line-height-tight);
  }

  .muted {
    color: var(--ink-muted);
  }

  .controls {
    display: grid;
    gap: var(--space-3);
  }

  .groups {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 26rem), 1fr));
    gap: var(--space-4);
  }

  .group-panel {
    min-width: 0;
    padding: var(--space-4);
    background: var(--surface);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-panel);
  }
</style>

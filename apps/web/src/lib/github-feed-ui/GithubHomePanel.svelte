<script lang="ts">
  import {
    type GithubFeedState,
    GithubFeedView,
    githubPagePath,
  } from '#lib/github-feed/feed-view.ts';
  import FeedGroupCard from '#lib/github-feed-ui/FeedGroupCard.svelte';
  import FeedNotice from '#lib/github-feed-ui/FeedNotice.svelte';

  let { github }: { github: GithubFeedState } = $props();

  const rowsPerGroup = 3;

  let view = $derived(
    github.status === 'loaded'
      ? new GithubFeedView({ feed: github.feed })
      : null,
  );
</script>

<section class="panel" aria-labelledby="github-panel-title">
  <header>
    <h2 id="github-panel-title">GitHub</h2>
    {#if view?.status === 'ready'}
      <a class="view-all" href={githubPagePath}>
        View all<span class="visually-hidden"> GitHub activity</span>
      </a>
    {/if}
  </header>
  {#if view === null}
    <FeedNotice kind="failed" />
  {:else if view.status !== 'ready'}
    <FeedNotice kind={view.status} />
  {:else}
    <div class="groups">
      {#each view.groups as group (group.key)}
        <FeedGroupCard
          {group}
          limit={rowsPerGroup}
          moreHref={githubPagePath}
          headingLevel={3}
        />
      {/each}
    </div>
  {/if}
</section>

<style>
  .panel {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5);
    background: var(--surface);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-panel);
  }

  header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
  }

  h2 {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    line-height: var(--line-height-tight);
  }

  .view-all {
    color: var(--ink-muted);
    font-size: var(--font-size-sm);
  }

  .view-all:hover {
    color: var(--ink);
  }

  .groups {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
    gap: var(--space-5);
  }

  @media (width < 40rem) {
    .panel {
      padding: var(--space-4);
    }
  }
</style>

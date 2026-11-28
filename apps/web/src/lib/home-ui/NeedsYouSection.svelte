<script lang="ts">
  import type { HomeFeed } from '#lib/home/home-feed.ts';
  import FeedNotice from '#lib/github-feed-ui/FeedNotice.svelte';
  import FeedRowLink from '#lib/github-feed-ui/FeedRowLink.svelte';
  import HomeSection from '#lib/home-ui/HomeSection.svelte';

  let { feed }: { feed: HomeFeed } = $props();

  let status = $derived(feed.status);
  let rows = $derived(feed.needsYou);
</script>

<HomeSection id="needs-you-title" title="Needs you">
  {#snippet aside()}Only things you’re the blocker on{/snippet}
  {#if status !== 'ready'}
    <div class="notice"><FeedNotice kind={status} /></div>
  {:else if rows.length === 0}
    <p class="empty">Nothing needs you</p>
  {:else}
    <ul class="rows">
      {#each rows as row (row.id)}
        <FeedRowLink {row} />
      {/each}
    </ul>
  {/if}
</HomeSection>

<style>
  .notice {
    padding: var(--space-4);
  }

  .empty {
    padding: var(--density-row-block) var(--density-row-inline);
    font-size: var(--font-size-sm);
    color: var(--ink-muted);
  }

  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>

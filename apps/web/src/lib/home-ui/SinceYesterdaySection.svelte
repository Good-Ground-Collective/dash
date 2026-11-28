<script lang="ts">
  import type { HomeFeed } from '#lib/home/home-feed.ts';
  import FeedRowLink from '#lib/github-feed-ui/FeedRowLink.svelte';
  import HomeSection from '#lib/home-ui/HomeSection.svelte';

  let { feed }: { feed: HomeFeed } = $props();

  let status = $derived(feed.status);
  let rows = $derived(feed.sinceYesterday);
</script>

<HomeSection id="since-yesterday-title" title="Since yesterday">
  {#snippet aside()}Last 24 hours{/snippet}
  {#if status !== 'ready'}
    <p class="empty">No GitHub activity to show</p>
  {:else if rows.length === 0}
    <p class="empty">Nothing merged or released in the last 24 hours</p>
  {:else}
    <ul class="rows">
      {#each rows as row (row.id)}
        <FeedRowLink {row} />
      {/each}
    </ul>
  {/if}
</HomeSection>

<style>
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

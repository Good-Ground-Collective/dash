<script lang="ts">
  import type { FeedGroup } from '#lib/github-feed/feed-view.ts';
  import FeedRowLink from '#lib/github-feed-ui/FeedRowLink.svelte';

  let {
    group,
    limit = null,
    moreHref = null,
    headingLevel = 2,
  }: {
    group: FeedGroup;
    /** Rows to show, or `null` for all of them. */
    limit?: number | null;
    /** Where the rest of the group is, linked when rows are left out. */
    moreHref?: string | null;
    headingLevel?: 2 | 3;
  } = $props();

  let shown = $derived(
    limit === null ? group.rows : group.rows.slice(0, limit),
  );
  let hidden = $derived(group.rows.length - shown.length);
  let headingId = $derived(`feed-${group.key}`);
</script>

<section class="group" aria-labelledby={headingId}>
  <header>
    <svelte:element this={`h${headingLevel}`} id={headingId} class="title">
      {group.title}
    </svelte:element>
    <span class="count">
      {group.rows.length}<span class="visually-hidden"> in total</span>
    </span>
  </header>
  {#if shown.length === 0}
    <p class="empty">{group.empty}</p>
  {:else}
    <ul>
      {#each shown as row (row.id)}
        <FeedRowLink {row} />
      {/each}
    </ul>
  {/if}
  {#if hidden > 0 && moreHref !== null}
    <a class="more" href={moreHref}>
      View all {group.rows.length}<span class="visually-hidden">
        {` ${group.title.toLowerCase()}`}
      </span>
    </a>
  {/if}
</section>

<style>
  .group {
    display: grid;
    align-content: start;
    gap: var(--space-2);
    min-width: 0;
  }

  header {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }

  .title {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    line-height: var(--line-height-tight);
  }

  .count {
    padding: 0 var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--faint);
    color: var(--ink-muted);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
  }

  ul {
    margin: 0;
    padding: 0;
    overflow: hidden;
    list-style: none;
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-control);
  }

  .empty {
    padding: var(--density-row-block) var(--density-row-inline);
    border: var(--border-hairline) dashed var(--line);
    border-radius: var(--radius-control);
    color: var(--ink-muted);
    font-size: var(--font-size-sm);
  }

  .more {
    justify-self: start;
    color: var(--ink-muted);
    font-size: var(--font-size-sm);
  }

  .more:hover {
    color: var(--ink);
  }
</style>

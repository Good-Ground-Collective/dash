<script lang="ts">
  import type { FeedRow } from '#lib/github-feed/feed-rows.ts';
  import { RelativeTime } from '#lib/github-feed/relative-time.ts';

  let { row }: { row: FeedRow } = $props();
</script>

<li>
  <a class="row" href={row.href} target="_blank" rel="noreferrer">
    <span class="text">
      <span class="title">{row.title}</span>
      <span class="meta">
        <span class="context">{row.context}</span>
        {#if row.detail !== null}
          <span aria-hidden="true">·</span>
          <span>{row.detail}</span>
        {/if}
        <span aria-hidden="true">·</span>
        <time datetime={row.updatedAt.toISOString()}>
          {RelativeTime.since(row.updatedAt)}
        </time>
      </span>
    </span>
    {#if row.badges.length > 0}
      <span class="badges">
        {#each row.badges as badge (badge.label)}
          <span class="badge {badge.tone}">{badge.label}</span>
        {/each}
      </span>
    {/if}
    <span class="visually-hidden">(opens GitHub)</span>
  </a>
</li>

<style>
  li:not(:first-child) {
    border-top: var(--border-hairline) solid var(--line);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    padding: var(--density-row-block) var(--density-row-inline);
    color: var(--ink);
    text-decoration: none;
  }

  .row:hover {
    background: var(--faint);
  }

  .row:hover .title {
    text-decoration: underline;
  }

  .text {
    display: grid;
    flex: 1 1 14rem;
    gap: 2px;
    min-width: 0;
  }

  .title {
    overflow-wrap: anywhere;
    font-weight: var(--font-weight-medium);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--space-1);
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
  }

  .context {
    overflow-wrap: anywhere;
    font-family: var(--font-mono);
  }

  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .badge {
    padding: 2px var(--space-2);
    border-radius: var(--radius-pill);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    white-space: nowrap;
  }

  .badge.ok {
    background: var(--ok-surface);
    color: var(--ok);
  }

  .badge.warn {
    background: var(--warn-surface);
    color: var(--warn);
  }

  .badge.bad {
    background: var(--bad-surface);
    color: var(--bad);
  }

  .badge.neutral {
    background: var(--faint);
    color: var(--ink-muted);
  }
</style>

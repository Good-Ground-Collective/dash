<script lang="ts">
  import type { SinceYesterdayGroup } from '#lib/home/since-yesterday-group.ts';
  import FeedRowLink from '#lib/github-feed-ui/FeedRowLink.svelte';
  import ProgressMeter from '#lib/objectives-ui/ProgressMeter.svelte';

  let {
    group,
    open,
    ontoggle,
  }: { group: SinceYesterdayGroup; open: boolean; ontoggle: () => void } =
    $props();

  let panelId = $derived(`since-yesterday-${group.id.replaceAll(':', '-')}`);
  let hasMeter = $derived(group.kind === 'epic' || group.kind === 'initiative');
</script>

<li class="group" data-group={group.id}>
  <button
    type="button"
    class="toggle"
    aria-expanded={open}
    aria-controls={open ? panelId : undefined}
    onclick={ontoggle}
  >
    <span class="lead">
      <span class="chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
      <span class="title">{group.title}</span>
    </span>
    <span class="tail">
      <span class="summary">{group.summary}</span>
      {#if hasMeter}
        <ProgressMeter progress={group.progress} />
      {/if}
    </span>
  </button>
  {#if open}
    <div class="details" id={panelId}>
      {#each group.sections as section (section.id)}
        <div class="section">
          {#if section.title !== null}
            <p class="section-head">
              <span class="section-title">{section.title}</span>
              <span class="section-summary">{section.summary}</span>
            </p>
          {/if}
          <ul
            class="rows"
            aria-label={`${section.title ?? group.title} merges and releases`}
          >
            {#each section.rows as row (row.id)}
              <FeedRowLink {row} />
            {/each}
          </ul>
        </div>
      {/each}
      {#if group.href !== null}
        <a class="open" href={group.href} target="_blank" rel="noreferrer">
          Open on GitHub<span class="visually-hidden">: {group.title}</span>
        </a>
      {/if}
    </div>
  {/if}
</li>

<style>
  .group {
    container-type: inline-size;
    border-top: var(--border-hairline) solid var(--line);
  }

  .toggle {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: center;
    gap: var(--space-1) var(--space-3);
    width: 100%;
    min-width: 0;
    min-height: var(--touch-target);
    padding: var(--space-2) var(--density-row-inline);
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .toggle:hover .title {
    text-decoration: underline;
  }

  .lead {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    min-width: 0;
  }

  .chevron {
    flex: none;
    width: 0.875rem;
    font-family: var(--font-mono);
    color: var(--ink-muted);
  }

  .title {
    min-width: 0;
    overflow-wrap: anywhere;
    font-weight: var(--font-weight-medium);
  }

  .tail {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
    min-width: 0;
    padding-left: calc(0.875rem + var(--space-2));
  }

  .summary {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
  }

  .details {
    display: grid;
    gap: var(--space-2);
    min-width: 0;
    padding-bottom: var(--space-2);
  }

  .section-head {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--space-3);
    margin: 0;
    padding: var(--space-1) var(--density-row-inline) 0;
    font-size: var(--font-size-sm);
  }

  .section-title {
    overflow-wrap: anywhere;
    font-weight: var(--font-weight-medium);
  }

  .section-summary {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
  }

  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .open {
    padding: 0 var(--density-row-inline);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--ink);
    text-decoration: none;
  }

  .open:hover {
    text-decoration: underline;
  }
</style>

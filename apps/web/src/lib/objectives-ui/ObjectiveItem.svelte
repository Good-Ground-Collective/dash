<script lang="ts">
  import type { ObjectiveEntry } from '#lib/objectives/objectives-view.ts';
  import CrewSlot from '#lib/objectives-ui/CrewSlot.svelte';
  import ObjectiveBadges from '#lib/objectives-ui/ObjectiveBadges.svelte';
  import OverlayMenu from '#lib/objectives-ui/OverlayMenu.svelte';
  import ProgressMeter from '#lib/objectives-ui/ProgressMeter.svelte';

  let {
    entry,
    level,
  }: { entry: ObjectiveEntry; level: 'initiative' | 'epic' } = $props();

  let row = $derived(entry.row);
</script>

<div class="item {level}" data-objective={row.id}>
  <div class="head">
    {#if level === 'initiative'}
      <h3 class="title">
        <a href={row.href} target="_blank" rel="noreferrer">
          {row.title}<span class="visually-hidden"> (opens GitHub)</span>
        </a>
      </h3>
    {:else}
      <a class="title" href={row.href} target="_blank" rel="noreferrer">
        {row.title}<span class="visually-hidden"> (opens GitHub)</span>
      </a>
    {/if}
    <OverlayMenu id={row.id} title={row.title} actions={entry.actions} />
  </div>
  <div class="meta">
    <ProgressMeter progress={row.progress} />
    <ObjectiveBadges {row} />
    <span class="crew-slot"><CrewSlot crew={[]} /></span>
  </div>
  {#if row.update !== null || row.next !== null}
    <div class="lines">
      {#if row.update !== null}
        <a
          class="line update"
          href={row.update.href}
          target="_blank"
          rel="noreferrer"
        >
          {row.update.text}
        </a>
      {/if}
      {#if row.next !== null}
        <a class="line" href={row.next.href} target="_blank" rel="noreferrer">
          <span class="label">Next</span>
          {row.next.title}
        </a>
      {/if}
    </div>
  {/if}
</div>

<style>
  .item {
    display: grid;
    gap: var(--space-2);
    min-width: 0;
  }

  .head {
    display: flex;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    min-width: 0;
  }

  .title {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    font-weight: var(--font-weight-medium);
    color: var(--ink);
  }

  .initiative .title {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    line-height: var(--line-height-tight);
  }

  .title a,
  a.title {
    color: inherit;
    text-decoration: none;
  }

  .title a:hover,
  a.title:hover,
  .line:hover {
    text-decoration: underline;
  }

  .crew-slot {
    margin-left: auto;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
  }

  .lines {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .line {
    overflow: hidden;
    font-size: var(--font-size-sm);
    color: var(--ink-muted);
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .label {
    margin-right: var(--space-1);
    font-size: var(--font-size-2xs);
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
</style>

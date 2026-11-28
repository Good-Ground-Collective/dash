<script lang="ts">
  import type { HomeDisclosure } from '#lib/home/home-disclosure.ts';
  import type { InitiativeEntry } from '#lib/objectives/objectives-view.ts';
  import ObjectiveBadges from '#lib/objectives-ui/ObjectiveBadges.svelte';
  import OverlayMenu from '#lib/objectives-ui/OverlayMenu.svelte';
  import ProgressMeter from '#lib/objectives-ui/ProgressMeter.svelte';
  import FocusEpic from '#lib/home-ui/FocusEpic.svelte';

  let {
    initiative,
    disclosure,
    ontoggle,
  }: {
    initiative: InitiativeEntry;
    disclosure: HomeDisclosure;
    ontoggle: (id: string) => void;
  } = $props();

  let row = $derived(initiative.row);
</script>

<li class="initiative" data-objective={row.id}>
  <div class="head">
    <div class="text">
      <h3>
        <a href={row.href} target="_blank" rel="noreferrer">
          {row.title}<span class="visually-hidden"> (opens GitHub)</span>
        </a>
      </h3>
      <div class="meta">
        <ProgressMeter progress={row.progress} />
        <ObjectiveBadges {row} />
      </div>
    </div>
    <OverlayMenu id={row.id} title={row.title} actions={initiative.actions} />
  </div>
  {#if initiative.epics.length > 0}
    <ul class="epics" aria-label={`Epics in ${row.title}`}>
      {#each initiative.epics as epic (epic.row.id)}
        <FocusEpic
          {epic}
          open={disclosure.isOpen(epic.row.id)}
          ontoggle={() => ontoggle(epic.row.id)}
        />
      {/each}
    </ul>
  {:else}
    <p class="no-epics">
      No epics yet. Label an issue in this Project <code>epic</code> to add one.
    </p>
  {/if}
</li>

<style>
  .initiative:not(:first-child) {
    border-top: var(--border-hairline) solid var(--line);
  }

  .head {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-2) var(--space-2)
      var(--density-row-inline);
  }

  .text {
    display: grid;
    flex: 1;
    gap: var(--space-1);
    min-width: 0;
  }

  h3 {
    overflow-wrap: anywhere;
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
  }

  h3 a {
    color: var(--ink);
    text-decoration: none;
  }

  h3 a:hover {
    text-decoration: underline;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
  }

  .epics {
    margin: 0 0 var(--space-2);
    padding: 0;
    list-style: none;
  }

  .no-epics {
    padding: 0 var(--density-row-inline) var(--space-4);
    font-size: var(--font-size-sm);
    color: var(--ink-muted);
  }

  code {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
  }
</style>

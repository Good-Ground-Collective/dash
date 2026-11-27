<script lang="ts">
  import type { InitiativeEntry } from '#lib/objectives/objectives-view.ts';
  import ObjectiveItem from '#lib/objectives-ui/ObjectiveItem.svelte';

  let { initiative }: { initiative: InitiativeEntry } = $props();
</script>

<li class="card">
  <ObjectiveItem entry={initiative} level="initiative" />
  {#if initiative.epics.length > 0}
    <ul class="epics" aria-label={`Epics in ${initiative.row.title}`}>
      {#each initiative.epics as epic (epic.row.id)}
        <li><ObjectiveItem entry={epic} level="epic" /></li>
      {/each}
    </ul>
  {:else}
    <p class="no-epics">
      No epics yet. Label an issue in this Project <code>epic</code> to add one.
    </p>
  {/if}
</li>

<style>
  .card {
    display: grid;
    gap: var(--space-3);
    min-width: 0;
    padding: var(--space-4);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-control);
  }

  .epics {
    display: grid;
    margin: 0;
    padding: 0 0 0 var(--space-4);
    border-left: 2px solid var(--line);
    list-style: none;
  }

  .epics > li {
    padding: var(--space-3) 0;
  }

  .epics > li + li {
    border-top: var(--border-hairline) solid var(--line);
  }

  .no-epics {
    font-size: var(--font-size-sm);
    color: var(--ink-muted);
  }

  code {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
  }

  @media (width < 40rem) {
    .card {
      padding: var(--space-3);
    }

    .epics {
      padding-left: var(--space-3);
    }
  }
</style>

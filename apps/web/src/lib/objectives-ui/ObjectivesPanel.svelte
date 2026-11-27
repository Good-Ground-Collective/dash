<script lang="ts">
  import { page } from '$app/state';
  import { ObjectiveFilter } from '#lib/objectives/objective-filter.ts';
  import {
    type ObjectivesState,
    ObjectivesView,
  } from '#lib/objectives/objectives-view.ts';
  import InitiativeCard from '#lib/objectives-ui/InitiativeCard.svelte';
  import ObjectivesFilter from '#lib/objectives-ui/ObjectivesFilter.svelte';
  import ObjectivesNotice from '#lib/objectives-ui/ObjectivesNotice.svelte';

  let { objectives }: { objectives: ObjectivesState } = $props();

  let view = $derived(new ObjectivesView({ state: objectives }));
  let filter = $derived(new ObjectiveFilter({ url: page.url }));
  let status = $derived(view.status);
  let filterable = $derived(status === 'ready' || status === 'filtered-out');
</script>

<section class="panel" aria-labelledby="objectives-title">
  <header>
    <h2 id="objectives-title">Objectives</h2>
    {#if filterable}
      <ObjectivesFilter options={filter.options} />
    {/if}
  </header>
  {#each view.notices as notice (notice.id)}
    <p class="connection-notice" role="status">
      <span class="login">{notice.login}</span>
      {notice.message}
    </p>
  {/each}
  {#if status === 'ready'}
    <ol class="initiatives">
      {#each view.initiatives as initiative (initiative.row.id)}
        <InitiativeCard {initiative} />
      {/each}
    </ol>
  {:else}
    <ObjectivesNotice kind={status} />
  {/if}
</section>

<style>
  .panel {
    display: grid;
    gap: var(--space-4);
    min-width: 0;
    padding: var(--space-5);
    background: var(--surface);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-panel);
  }

  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  h2 {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    line-height: var(--line-height-tight);
  }

  .connection-notice {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-control);
    background: var(--warn-surface);
    color: var(--warn);
    font-size: var(--font-size-sm);
    overflow-wrap: anywhere;
  }

  .login {
    margin-right: var(--space-1);
    font-family: var(--font-mono);
    font-weight: var(--font-weight-medium);
  }

  .initiatives {
    display: grid;
    gap: var(--space-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  @media (width < 40rem) {
    .panel {
      padding: var(--space-4);
    }
  }
</style>

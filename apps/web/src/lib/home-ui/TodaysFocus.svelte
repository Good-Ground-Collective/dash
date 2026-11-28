<script lang="ts">
  import { page } from '$app/state';
  import { EpicDisclosure } from '#lib/home/epic-disclosure.ts';
  import { ObjectiveFilter } from '#lib/objectives/objective-filter.ts';
  import {
    type ObjectivesState,
    ObjectivesView,
  } from '#lib/objectives/objectives-view.ts';
  import ObjectivesFilter from '#lib/objectives-ui/ObjectivesFilter.svelte';
  import ObjectivesNotice from '#lib/objectives-ui/ObjectivesNotice.svelte';
  import FocusInitiative from '#lib/home-ui/FocusInitiative.svelte';
  import HomeSection from '#lib/home-ui/HomeSection.svelte';

  let { objectives }: { objectives: ObjectivesState } = $props();

  let view = $derived(new ObjectivesView({ state: objectives }));
  let filter = $derived(new ObjectiveFilter({ url: page.url }));
  let status = $derived(view.status);
  let filterable = $derived(status === 'ready' || status === 'filtered-out');
  let disclosure = $state(new EpicDisclosure());
</script>

<HomeSection id="focus-title" title="Today’s focus">
  {#snippet aside()}
    {#if filterable}
      <ObjectivesFilter options={filter.options} />
    {/if}
  {/snippet}
  {#each view.notices as notice (notice.id)}
    <p class="connection-notice" role="status">
      <span class="login">{notice.login}</span>
      {notice.message}
    </p>
  {/each}
  {#if status === 'ready'}
    <ol class="initiatives">
      {#each view.initiatives as initiative (initiative.row.id)}
        <FocusInitiative
          {initiative}
          {disclosure}
          ontoggle={(id) => (disclosure = disclosure.toggled(id))}
        />
      {/each}
    </ol>
  {:else}
    <div class="notice"><ObjectivesNotice kind={status} /></div>
  {/if}
</HomeSection>

<style>
  .connection-notice {
    margin: var(--space-3) var(--density-row-inline) 0;
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
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .notice {
    padding: var(--space-4);
  }
</style>

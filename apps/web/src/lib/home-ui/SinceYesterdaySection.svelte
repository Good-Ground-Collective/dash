<script lang="ts">
  import { onMount } from 'svelte';
  import { BrowserDisclosureStore } from '#lib/home/browser-disclosure-store.ts';
  import { HomeDisclosure } from '#lib/home/home-disclosure.ts';
  import type { HomeFeed } from '#lib/home/home-feed.ts';
  import HomeSection from '#lib/home-ui/HomeSection.svelte';
  import SinceYesterdayGroupItem from '#lib/home-ui/SinceYesterdayGroupItem.svelte';

  let { feed }: { feed: HomeFeed } = $props();

  let status = $derived(feed.status);
  let groups = $derived(feed.sinceYesterday);

  const store = new BrowserDisclosureStore({
    key: 'dash:home:since-yesterday:open',
  });
  let disclosure = $state(new HomeDisclosure());

  onMount(() => {
    disclosure = new HomeDisclosure({ open: store.readOpenIds() });
  });

  function toggle(id: string): void {
    disclosure = disclosure.toggled(id);
    store.writeOpenIds(disclosure.openIds);
  }
</script>

<HomeSection id="since-yesterday-title" title="Since yesterday">
  {#snippet aside()}Last 24 hours{/snippet}
  {#if status !== 'ready'}
    <p class="empty">No GitHub activity to show</p>
  {:else if groups.length === 0}
    <p class="empty">Nothing merged or released in the last 24 hours</p>
  {:else}
    <ul class="groups">
      {#each groups as group (group.id)}
        <SinceYesterdayGroupItem
          {group}
          open={disclosure.isOpen(group.id)}
          ontoggle={() => toggle(group.id)}
        />
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

  .groups {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .groups > :global(li:first-child) {
    border-top: 0;
  }
</style>

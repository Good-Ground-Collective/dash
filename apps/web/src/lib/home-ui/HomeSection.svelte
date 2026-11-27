<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    id,
    title,
    aside,
    children,
  }: {
    /** Names the heading, so the section is a region labelled by its title. */
    id: string;
    title: string;
    aside?: Snippet;
    children: Snippet;
  } = $props();
</script>

<section class="section" aria-labelledby={id}>
  <header>
    <h2 {id}>{title}</h2>
    {#if aside}
      <div class="aside">{@render aside()}</div>
    {/if}
  </header>
  {@render children()}
</section>

<style>
  .section {
    min-width: 0;
    overflow: hidden;
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
    gap: var(--space-2) var(--space-3);
    padding: var(--space-4) var(--density-row-inline);
    border-bottom: var(--border-hairline) solid var(--line);
  }

  h2 {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    line-height: var(--line-height-tight);
  }

  .aside {
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
  }
</style>

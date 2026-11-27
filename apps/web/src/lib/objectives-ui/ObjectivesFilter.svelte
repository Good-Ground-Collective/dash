<script lang="ts">
  import type { ObjectiveFilterOption } from '#lib/objectives/objective-filter.ts';

  let { options }: { options: readonly ObjectiveFilterOption[] } = $props();
</script>

<nav class="filter" aria-label="Filter objectives">
  {#each options as option (option.status)}
    <a
      class="chip"
      class:on={option.shown}
      href={option.href}
      data-sveltekit-noscroll
      data-sveltekit-replacestate
    >
      <span class="box" aria-hidden="true">{option.shown ? '✓' : ''}</span>
      {option.label}<span class="visually-hidden">
        {option.shown ? ', on' : ', off'}
      </span>
    </a>
  {/each}
</nav>

<style>
  .filter {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 2rem;
    padding: 0 var(--space-3);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-pill);
    color: var(--ink-muted);
    font-size: var(--font-size-sm);
    text-decoration: none;
  }

  .chip:hover {
    border-color: var(--ink-muted);
    color: var(--ink);
  }

  .chip.on {
    border-color: var(--ink);
    color: var(--ink);
  }

  .box {
    display: inline-grid;
    place-items: center;
    width: 0.875rem;
    height: 0.875rem;
    border: var(--border-hairline) solid currentcolor;
    border-radius: 3px;
    font-size: var(--font-size-2xs);
    line-height: 1;
  }
</style>

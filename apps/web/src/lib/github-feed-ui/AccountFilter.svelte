<script lang="ts">
  import type { AccountFilterOption } from '#lib/github-feed/feed-view.ts';

  let { options }: { options: AccountFilterOption[] } = $props();
</script>

<nav class="filter" aria-label="Filter by account">
  <ul>
    {#each options as option (option.href)}
      <li>
        <a
          class="chip"
          href={option.href}
          aria-current={option.current ? 'page' : undefined}
          data-sveltekit-noscroll
        >
          {option.label}
        </a>
      </li>
    {/each}
  </ul>
</nav>

<style>
  ul {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    min-height: var(--touch-target);
    padding: 0 var(--space-3);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-pill);
    background: var(--surface);
    color: var(--ink-muted);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    text-decoration: none;
    overflow-wrap: anywhere;
  }

  .chip:hover {
    border-color: var(--ink-muted);
    color: var(--ink);
  }

  .chip[aria-current='page'] {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--surface);
  }
</style>

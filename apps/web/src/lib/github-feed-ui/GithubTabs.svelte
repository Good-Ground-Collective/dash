<script lang="ts">
  import type { GithubTab } from '#lib/github-feed/feed-view.ts';

  let { tabs }: { tabs: GithubTab[] } = $props();
</script>

<nav class="tabs" aria-label="GitHub views">
  <ul>
    {#each tabs as tab (tab.key)}
      <li>
        <a
          class="tab"
          href={tab.href}
          aria-current={tab.current ? 'page' : undefined}
          data-sveltekit-noscroll
        >
          {tab.label}
          <span class="count">
            {tab.count}<span class="visually-hidden"> in total</span>
          </span>
        </a>
      </li>
    {/each}
  </ul>
</nav>

<style>
  .tabs {
    border-bottom: var(--border-hairline) solid var(--line);
  }

  ul {
    display: flex;
    gap: var(--space-1);
    overflow-x: auto;
    scrollbar-width: none;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tab {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--touch-target);
    padding: 0 var(--space-3);
    border-bottom: 2px solid transparent;
    color: var(--ink-muted);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    text-decoration: none;
    white-space: nowrap;
  }

  .tab:hover {
    color: var(--ink);
  }

  .tab[aria-current='page'] {
    border-bottom-color: var(--ink);
    color: var(--ink);
  }

  @media (width < 40rem) {
    .tab {
      padding: 0 var(--space-2);
    }
  }

  .count {
    padding: 0 var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--faint);
    font-size: var(--font-size-xs);
  }
</style>

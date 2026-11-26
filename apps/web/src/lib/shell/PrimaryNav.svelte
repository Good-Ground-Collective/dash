<script lang="ts">
  import { page } from '$app/state';
  import { navItems } from '#lib/shell/nav-items.ts';
</script>

<nav class="primary-nav" aria-label="Primary">
  <ul>
    {#each navItems as item (item.href)}
      <li>
        {#if item.available}
          <a
            class="nav-link"
            href={item.href}
            aria-current={page.url.pathname === item.href ? 'page' : undefined}
          >
            {item.label}
          </a>
        {:else}
          <span class="nav-link" aria-disabled="true" title="Not built yet">
            {item.label}
          </span>
        {/if}
      </li>
    {/each}
  </ul>
</nav>

<style>
  .primary-nav {
    overflow-x: auto;
    scrollbar-width: none;
  }

  ul {
    display: flex;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .nav-link {
    display: inline-flex;
    align-items: center;
    min-height: var(--touch-target);
    padding: 0 var(--space-3);
    border-radius: var(--radius-control);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-medium);
    color: var(--ink-muted);
    text-decoration: none;
    white-space: nowrap;
  }

  a.nav-link:hover {
    color: var(--ink);
    background: var(--faint);
  }

  a.nav-link[aria-current='page'] {
    color: var(--ink);
    background: var(--faint);
  }

  span.nav-link {
    cursor: default;
  }
</style>

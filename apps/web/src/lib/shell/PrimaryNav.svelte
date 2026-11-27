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
          <span class="nav-link unavailable">
            {item.label}<span class="visually-hidden">
              {' (not built yet)'}
            </span>
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

  .unavailable {
    cursor: default;
  }

  @media (width < 40rem) {
    .primary-nav {
      mask-image: linear-gradient(
        to right,
        var(--ink) calc(100% - var(--space-4)),
        transparent
      );
    }

    ul {
      gap: 0;
      width: max-content;
      min-width: 100%;
      padding-inline-end: var(--space-4);
    }

    .nav-link {
      padding: 0 var(--space-2);
      font-size: var(--font-size-sm);
    }
  }
</style>

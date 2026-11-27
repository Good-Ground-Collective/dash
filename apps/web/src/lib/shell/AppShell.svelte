<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Viewer } from '#lib/api/mission-control.ts';
  import type { BuildStamp } from '#lib/build/build-stamp.ts';
  import NeedsYou from '#lib/shell/NeedsYou.svelte';
  import PrimaryNav from '#lib/shell/PrimaryNav.svelte';
  import SearchButton from '#lib/shell/SearchButton.svelte';
  import ViewerAvatar from '#lib/shell/ViewerAvatar.svelte';

  let {
    viewer,
    build,
    children,
  }: { viewer: Viewer | null; build: BuildStamp; children: Snippet } = $props();
</script>

<div class="shell">
  <header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="/">Dash</a>
      <PrimaryNav />
      <div class="actions">
        <SearchButton />
        <ViewerAvatar {viewer} {build} />
      </div>
    </div>
  </header>

  <main class="content">
    {@render children()}
  </main>

  <NeedsYou />
</div>

<style>
  .shell {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }

  .topbar {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--surface);
    border-bottom: var(--border-hairline) solid var(--line);
  }

  .topbar-inner {
    max-width: var(--content-width);
    margin: 0 auto;
    padding: var(--space-2) var(--space-5);
    display: flex;
    align-items: center;
    gap: var(--space-5);
  }

  .brand {
    display: inline-flex;
    align-items: center;
    min-height: var(--touch-target);
    font-family: var(--font-display);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    letter-spacing: -0.01em;
    color: var(--ink);
    text-decoration: none;
  }

  .actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .content {
    flex: 1;
    width: 100%;
    max-width: var(--content-width);
    margin: 0 auto;
    padding: var(--space-6) var(--space-5) calc(var(--space-7) * 2);
  }

  @media (width < 40rem) {
    .topbar-inner {
      flex-wrap: wrap;
      gap: var(--space-2) var(--space-4);
      padding: var(--space-2) var(--space-4);
    }

    .topbar-inner :global(.primary-nav) {
      order: 3;
      flex-basis: 100%;
    }

    .content {
      padding: var(--space-5) var(--space-4) calc(var(--space-7) * 2);
    }
  }
</style>

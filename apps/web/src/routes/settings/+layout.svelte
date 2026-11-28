<script lang="ts">
  import SettingsSidebar from '#lib/settings-ui/SettingsSidebar.svelte';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
</script>

<div class="settings">
  <div class="sidebar">
    <SettingsSidebar />
  </div>

  <div class="section">
    {@render children()}
  </div>
</div>

<style>
  .settings {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--space-5);
  }

  .sidebar {
    flex: 0 1 220px;
    min-width: 200px;
  }

  .section {
    display: grid;
    flex: 1 1 28rem;
    gap: var(--space-5);
    min-width: 0;
    max-width: 52rem;
  }

  @media (width < 45rem) {
    .sidebar {
      flex-basis: 100%;
    }
  }
</style>

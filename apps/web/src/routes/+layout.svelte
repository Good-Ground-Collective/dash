<script lang="ts">
  import '@fontsource-variable/geist';
  import '@fontsource-variable/geist-mono';
  import '#lib/theme/characters.css';
  import '#lib/theme/base.css';
  import AppShell from '#lib/shell/AppShell.svelte';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();
</script>

<AppShell viewer={data.viewer}>
  {@render children()}
</AppShell>

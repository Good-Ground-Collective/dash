<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Viewer } from '#lib/api/mission-control.ts';
  import {
    setThemeContext,
    type ThemeContext,
  } from '#lib/theme/theme-context.ts';
  import AppShell from '#lib/shell/AppShell.svelte';
  import {
    SharedThemeLayouts,
    type ThemeLayouts,
  } from '#lib/theme/theme-layouts.ts';
  import type { ThemePreference } from '#lib/theme/theme-preference-reader.ts';

  let {
    saved,
    viewer,
    children,
  }: {
    /** The appearance the server rendered the page in. */
    saved: ThemePreference;
    viewer: Viewer | null;
    children: Snippet;
  } = $props();

  /** Themes that bring their own page layout. None does yet. */
  const themeLayouts: ThemeLayouts = new SharedThemeLayouts({
    shared: AppShell,
    own: {},
  });

  let previewed = $state<ThemePreference | null>(null);

  const theme: ThemeContext = setThemeContext({
    get current() {
      return previewed ?? saved;
    },
    preview: (preference) => {
      previewed = preference;
    },
    settle: () => {
      previewed = null;
    },
  });

  const Layout = $derived(themeLayouts.for(theme.current.theme));

  $effect(() => {
    document.documentElement.dataset['theme'] = theme.current.theme;
    document.documentElement.dataset['mode'] = theme.current.mode;
  });
</script>

<Layout {viewer}>
  {@render children()}
</Layout>

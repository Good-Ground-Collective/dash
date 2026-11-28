<script lang="ts">
  import '@fontsource-variable/geist';
  import '@fontsource-variable/geist-mono';
  import '#lib/theme/themes/characters.css';
  import '#lib/theme/base.css';
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { API_BASE_URL } from '$app/env/public';
  import { HttpMissionControl } from '#lib/api/mission-control.ts';
  import { HttpTimeZoneStore } from '#lib/time-zone/time-zone-store.ts';
  import {
    MissionControlTimeZoneReporter,
    type TimeZoneReporter,
  } from '#lib/time-zone/time-zone-reporter.ts';
  import {
    MissionControlSessionRenewer,
    type SessionRenewer,
  } from '#lib/session/session-renewer.ts';
  import ThemeRoot from '#lib/theme-ui/ThemeRoot.svelte';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();

  onMount(() => {
    if (data.viewer === null) return;
    const sessionRenewer: SessionRenewer = new MissionControlSessionRenewer({
      missionControl: new HttpMissionControl({
        baseUrl: API_BASE_URL,
        fetch: globalThis.fetch.bind(globalThis),
      }),
    });
    void sessionRenewer.renew();
  });

  const timeZoneReporter: TimeZoneReporter = new MissionControlTimeZoneReporter(
    {
      store: HttpTimeZoneStore.inBrowser({ baseUrl: API_BASE_URL }),
    },
  );

  $effect(() => {
    if (data.viewer === null) return;
    void timeZoneReporter
      .report({
        stored: data.viewer.timeZone,
        browser: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      .then(async (saved) => {
        if (saved) await invalidateAll();
      });
  });
</script>

<ThemeRoot saved={data.appearance} viewer={data.viewer} build={data.build}>
  {@render children()}
</ThemeRoot>

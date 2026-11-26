<script lang="ts">
  import '@fontsource-variable/geist';
  import '@fontsource-variable/geist-mono';
  import '#lib/theme/characters.css';
  import '#lib/theme/base.css';
  import { onMount } from 'svelte';
  import { API_BASE_URL } from '$app/env/public';
  import { HttpMissionControl } from '#lib/api/mission-control.ts';
  import {
    MissionControlSessionRenewer,
    type SessionRenewer,
  } from '#lib/session/session-renewer.ts';
  import AppShell from '#lib/shell/AppShell.svelte';
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
</script>

<AppShell viewer={data.viewer}>
  {@render children()}
</AppShell>

<script lang="ts">
  import '@fontsource-variable/geist';
  import '@fontsource-variable/geist-mono';
  import '#lib/theme/themes/characters.css';
  import '#lib/theme/base.css';
  import { onMount, untrack } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { API_BASE_URL } from '$app/env/public';
  import { HttpMissionControl } from '#lib/api/mission-control.ts';
  import { BrowserLiveEventStream } from '#lib/live/browser-live-event-stream.ts';
  import { setLiveEventStream } from '#lib/live/live-event-stream-context.ts';
  import { HttpNeedsYou } from '#lib/needs-you/http-needs-you.ts';
  import { LiveNeedsYou } from '#lib/needs-you/live-needs-you.ts';
  import { setNeedsYouFeed } from '#lib/needs-you/needs-you-feed-context.ts';
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

  const liveEvents = new BrowserLiveEventStream({ baseUrl: API_BASE_URL });
  setLiveEventStream(liveEvents);

  const needsYou = new LiveNeedsYou({
    initial: untrack(() => data.needsYou),
    sessions: untrack(() => data.needsYouSessions),
    stream: liveEvents,
    reads: HttpNeedsYou.inBrowser({ baseUrl: API_BASE_URL }),
  });
  setNeedsYouFeed(needsYou);

  const signedIn = $derived(data.viewer !== null);

  $effect(() => {
    needsYou.reset({
      items: data.needsYou,
      sessions: data.needsYouSessions,
    });
  });

  $effect(() => {
    if (!signedIn) return;
    return needsYou.start();
  });

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

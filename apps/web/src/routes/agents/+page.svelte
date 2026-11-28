<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { API_BASE_URL } from '$app/env/public';
  import { page } from '$app/state';
  import { AgentSessionActivity } from '#lib/agents/agent-session-activity.ts';
  import { AgentWording } from '#lib/agents/agent-wording.ts';
  import { AgentSessionLink } from '#lib/agents/agent-session-link.ts';
  import { HttpAgentSessions } from '#lib/agents/http-agent-sessions.ts';
  import { LiveAgentSessions } from '#lib/agents/live-agent-sessions.ts';
  import AgentBenchGroup from '#lib/agents-ui/AgentBenchGroup.svelte';
  import AgentStatsStrip from '#lib/agents-ui/AgentStatsStrip.svelte';
  import { ClockRefresh } from '#lib/home/clock-refresh.ts';
  import HomeSection from '#lib/home-ui/HomeSection.svelte';
  import { getLiveEventStream } from '#lib/live/live-event-stream-context.ts';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const feed = new LiveAgentSessions({
    initial: untrack(() =>
      data.agents.status === 'loaded' ? data.agents.sessions : [],
    ),
    loaded: untrack(() => data.agents.status === 'loaded'),
    stream: getLiveEventStream(),
    reads: HttpAgentSessions.inBrowser({ baseUrl: API_BASE_URL }),
  });

  let now = $state(new Date());
  let sessions = $derived(feed.sessions);
  let groups = $derived(sessions.groups());
  let focusedKey = $derived(AgentSessionLink.focusedKey(page.url.searchParams));

  let focusMissing = $derived(
    focusedKey !== null &&
      !sessions.list.some(
        (session) => AgentSessionActivity.key(session) === focusedKey,
      ),
  );

  onMount(() => {
    const stopFollowing = feed.start();
    const stopClock = new ClockRefresh({
      refresh: () => {
        now = new Date();
      },
      intervalMs: 30_000,
      visibility: document,
    }).start();
    return () => {
      stopFollowing();
      stopClock();
    };
  });
</script>

<svelte:head>
  <title>Agents · Dash</title>
</svelte:head>

<section class="agents" aria-labelledby="agents-title">
  <header class="intro">
    <h1 id="agents-title">Agents</h1>
    <p class="muted">
      Every session at once, updating as agents report. Subagents roll up under
      their session.
    </p>
  </header>

  {#if !feed.loaded}
    <div class="notice" role="status">
      <p class="title">Agent sessions didn’t load</p>
      <p class="body">
        Mission Control didn’t send them. Reload to try again; the rest of Dash
        still works.
      </p>
    </div>
  {:else}
    {#if focusMissing}
      <p class="missing" role="status">
        That session hasn’t reported in the last 24 hours.
      </p>
    {/if}
    <AgentStatsStrip stats={sessions.stats()} />
    <HomeSection id="sessions-title" title="Sessions">
      {#snippet aside()}Last 24 h · grouped by bench{/snippet}
      {#if groups.length === 0}
        <p class="empty">No agent has reported in the last 24 hours.</p>
      {:else}
        <ul class="benches">
          {#each groups as group (group.benchId ?? '')}
            <AgentBenchGroup {group} {now} {focusedKey} />
          {/each}
        </ul>
      {/if}
    </HomeSection>
    <p class="note">
      Agents report through heartbeats. A working agent that goes quiet for {AgentWording.STALE_AFTER_MINUTES}
      minutes shows as stale, and after {AgentWording.LOST_AFTER_MINUTES} minutes
      as lost; its next heartbeat brings it back.
    </p>
  {/if}
</section>

<style>
  .agents {
    display: grid;
    gap: var(--space-5);
  }

  .intro {
    display: grid;
    gap: var(--space-1);
  }

  h1 {
    font-family: var(--font-display);
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    letter-spacing: -0.015em;
    line-height: var(--line-height-tight);
  }

  .muted,
  .note {
    color: var(--ink-muted);
  }

  .note {
    font-size: var(--font-size-xs);
  }

  .missing {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-control);
    background: var(--warn-surface);
    font-size: var(--font-size-sm);
    color: var(--ink-muted);
  }

  .benches {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .empty {
    padding: var(--density-row-block) var(--density-row-inline);
    font-size: var(--font-size-sm);
    color: var(--ink-muted);
  }

  .notice {
    display: grid;
    gap: var(--space-1);
    padding: var(--space-4);
    border-radius: var(--radius-control);
    background: var(--warn-surface);
  }

  .title {
    font-weight: var(--font-weight-medium);
    color: var(--warn);
  }

  .body {
    font-size: var(--font-size-sm);
    color: var(--ink-muted);
  }
</style>

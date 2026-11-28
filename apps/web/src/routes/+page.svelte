<script lang="ts">
  import { onMount } from 'svelte';
  import { ClockRefresh } from '#lib/home/clock-refresh.ts';
  import { HomeFeed } from '#lib/home/home-feed.ts';
  import { HomeGreeting } from '#lib/home/home-greeting.ts';
  import { SetupChecklist } from '#lib/onboarding/setup-checklist.ts';
  import SetupChecklistCard from '#lib/onboarding-ui/SetupChecklistCard.svelte';
  import BriefingCard from '#lib/briefing-ui/BriefingCard.svelte';
  import ComingSoon from '#lib/home-ui/ComingSoon.svelte';
  import NeedsYouSection from '#lib/home-ui/NeedsYouSection.svelte';
  import SinceYesterdaySection from '#lib/home-ui/SinceYesterdaySection.svelte';
  import TodaysFocus from '#lib/home-ui/TodaysFocus.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  let now = $state(new Date());

  $effect(() => {
    void data;
    now = new Date();
  });

  onMount(() =>
    new ClockRefresh({
      refresh: () => {
        now = new Date();
      },
      visibility: document,
    }).start(),
  );

  let checklist = $derived(SetupChecklist.from(data.checklist));
  let greeting = $derived(
    new HomeGreeting({ now, name: data.viewer?.name ?? null }),
  );
  let feed = $derived(
    data.github === null
      ? null
      : new HomeFeed({
          state: data.github,
          now,
          objectives: data.everyObjective,
        }),
  );
</script>

<svelte:head>
  <title>Home · Dash</title>
</svelte:head>

<section class="home" aria-labelledby="home-title">
  <header class="greeting">
    <h1 id="home-title">{greeting.salutation}</h1>
    <p class="date">{greeting.date}</p>
  </header>
  {#if checklist}
    <SetupChecklistCard {checklist} />
  {/if}
  {#if feed !== null}
    {#if data.briefing !== null}
      <BriefingCard briefing={data.briefing} {now} />
    {/if}
    <div class="columns">
      <div class="column main">
        <NeedsYouSection {feed} />
        {#if data.objectives !== null}
          <TodaysFocus objectives={data.objectives} />
        {/if}
      </div>
      <div class="column side">
        <ComingSoon
          id="agents-title"
          title="Agents now"
          message="Coming soon: agents at work and what they’re doing."
        />
        <ComingSoon
          id="benches-title"
          title="Benches"
          message="Coming soon: each bench’s health and its agents."
        />
        <SinceYesterdaySection {feed} />
      </div>
    </div>
  {:else if !checklist}
    <div class="panel">
      <p class="empty-title">Nothing here yet</p>
      <p class="empty-body">
        Objectives, agents and benches will gather here as they come online.
      </p>
    </div>
  {/if}
</section>

<style>
  .home {
    display: grid;
    gap: var(--space-5);
  }

  .greeting {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
  }

  h1 {
    font-family: var(--font-display);
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    letter-spacing: -0.015em;
    line-height: var(--line-height-tight);
  }

  .date {
    color: var(--ink-muted);
  }

  .columns {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--space-5);
  }

  .column {
    display: grid;
    gap: var(--space-5);
    min-width: 0;
  }

  .main {
    flex: 3 1 32rem;
  }

  .side {
    flex: 2 1 21rem;
  }

  .panel {
    padding: var(--space-6) var(--space-5);
    background: var(--surface);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-panel);
  }

  .empty-title {
    font-weight: var(--font-weight-medium);
  }

  .empty-body {
    margin-top: var(--space-1);
    color: var(--ink-muted);
  }
</style>

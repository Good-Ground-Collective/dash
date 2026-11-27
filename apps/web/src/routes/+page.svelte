<script lang="ts">
  import { SetupChecklist } from '#lib/onboarding/setup-checklist.ts';
  import SetupChecklistCard from '#lib/onboarding-ui/SetupChecklistCard.svelte';
  import GithubHomePanel from '#lib/github-feed-ui/GithubHomePanel.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  let checklist = $derived(SetupChecklist.from(data.checklist));
</script>

<svelte:head>
  <title>Home · Dash</title>
</svelte:head>

<section class="home" aria-labelledby="home-title">
  <h1 id="home-title">Home</h1>
  {#if checklist}
    <SetupChecklistCard {checklist} />
  {/if}
  {#if data.github !== null}
    <GithubHomePanel github={data.github} />
  {/if}
  {#if !checklist && data.github === null}
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
    gap: var(--space-4);
  }

  h1 {
    font-family: var(--font-display);
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    letter-spacing: -0.015em;
    line-height: var(--line-height-tight);
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

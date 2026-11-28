<script lang="ts">
  import '#lib/auth-ui/auth-form.css';
  import { onMount, tick } from 'svelte';
  import { API_BASE_URL } from '$app/env/public';
  import { HttpBriefings } from '#lib/api/briefings/briefings.ts';
  import { MissionControlError } from '#lib/api/mission-control-error.ts';
  import { BriefingEventReader } from '#lib/briefing/briefing-event-reader.ts';
  import {
    BriefingRun,
    type BriefingRunEvent,
    type BriefingRunState,
  } from '#lib/briefing/briefing-run.ts';
  import {
    type BriefingState,
    BriefingView,
  } from '#lib/briefing/briefing-view.ts';
  import { BriefingWording } from '#lib/briefing/briefing-wording.ts';
  import HomeSection from '#lib/home-ui/HomeSection.svelte';
  import { getLiveEventStream } from '#lib/live/live-event-stream-context.ts';

  let { briefing, now }: { briefing: BriefingState; now: Date } = $props();

  const client = HttpBriefings.inBrowser({ baseUrl: API_BASE_URL });
  const liveEvents = getLiveEventStream();

  /** What the browser re-read, shown in place of the page's copy until the page loads again. */
  let reread = $state.raw<BriefingState | null>(null);
  let runState = $state.raw<BriefingRunState | null>(null);
  let starting = $state(false);
  let finished = $state('');
  let refusal = $state<string | null>(null);
  let button = $state<HTMLButtonElement>();
  let startedHere = false;
  let latestRead = 0;
  const ended = new Set<string>();

  let view = $derived(new BriefingView({ state: reread ?? briefing, now }));
  let run = $derived(
    runState ?? BriefingRun.reconcile(view.running, { ended }),
  );
  let busy = $derived(starting || BriefingRun.busy(run));
  let statusLine = $derived(
    run.phase === 'running'
      ? BriefingWording.stage(run.stage)
      : run.phase === 'requested' || starting
        ? BriefingWording.requested()
        : finished,
  );

  $effect(() => {
    void briefing;
    reread = null;
    runState = null;
    finished = '';
  });

  /** A quiet re-read keeps what's shown when Mission Control can't answer. */
  const refresh = async () => {
    const ticket = ++latestRead;
    try {
      const briefings = await client.latest();
      if (ticket !== latestRead) return;
      reread = { status: 'loaded', briefings };
      runState = BriefingRun.reconcile(briefings.running, {
        current: run,
        ended,
      });
    } catch {
      return;
    }
  };

  const receive = async (event: BriefingRunEvent) => {
    if (event.kind === 'ready') ended.add(event.runId);

    const step = BriefingRun.receive({ state: run, event });
    runState = step.state;
    if (step.finished !== null) {
      finished = BriefingWording.finished(step.finished);
    }
    if (step.refetch) await refresh();
    if (step.finished === null) {
      runState = BriefingRun.confirm({ state: run, event });
      return;
    }

    if (startedHere) {
      startedHere = false;
      await tick();
      button?.focus();
    }
  };

  const regenerate = async () => {
    if (busy) return;
    refusal = null;
    finished = '';
    starting = true;
    startedHere = true;

    try {
      const accepted = await client.regenerate();
      if (run.phase === 'idle' && !ended.has(accepted.runId)) {
        runState = BriefingRun.requested(accepted.runId);
      }
    } catch (error) {
      startedHere = false;
      refusal = BriefingWording.refusal(
        error instanceof MissionControlError ? error : null,
      );
      await refresh();
    } finally {
      starting = false;
    }
  };

  const refreshWhenVisible = () => {
    if (document.visibilityState === 'visible') {
      void refresh();
    }
  };

  onMount(() => {
    const stopProgress = liveEvents.subscribe({
      definition: BriefingEventReader.PROGRESS,
      onEvent: (event) => void receive(event),
      onOpen: ({ reconnected }) => {
        if (reconnected) void refresh();
      },
    });
    const stopReady = liveEvents.subscribe({
      definition: BriefingEventReader.READY,
      onEvent: (event) => void receive(event),
    });
    return () => {
      stopProgress();
      stopReady();
    };
  });
</script>

<svelte:document onvisibilitychange={refreshWhenVisible} />

<HomeSection id="briefing-title" title="Briefing">
  {#snippet aside()}
    <span class="meta">
      {#if view.generated !== null}
        <span>{view.generated}</span>
      {/if}
      {#if view.snapshot !== null}
        <span class:stale={view.snapshot.stale}>
          {view.snapshot.text}{view.snapshot.stale ? ' · stale' : ''}
        </span>
      {/if}
      {#if view.spend !== null}
        <span>{view.spend}</span>
      {/if}
    </span>
  {/snippet}

  <div class="body">
    <div class="content" aria-busy={busy}>
      {#if view.message !== null}
        <p class="message">{view.message}</p>
      {/if}
      {#if view.note !== null}
        <p class="note">{view.note}</p>
      {/if}
      {#each view.paragraphs as paragraph, index (index)}
        <p class="paragraph">
          {#each paragraph as segment, position (position)}
            {#if segment.href !== null}
              <a href={segment.href}>{segment.text}</a>
            {:else}
              {segment.text}
            {/if}
          {/each}
        </p>
      {/each}
    </div>

    <p class="status" role="status">{statusLine}</p>
    {#if refusal !== null}
      <p class="auth-error" role="alert">{refusal}</p>
    {/if}

    {#if view.status !== 'failed' && view.status !== 'unconfigured'}
      <footer>
        {#if view.sources.length > 0}
          <p class="sources">Sources: {view.sources.join(' · ')}</p>
        {/if}
        {#if view.budgetNote !== null}
          <p class="sources">{view.budgetNote}</p>
        {/if}
        <button
          class="auth-button small quiet"
          type="button"
          bind:this={button}
          disabled={busy || !view.canRegenerate}
          onclick={regenerate}
        >
          {busy ? 'Regenerating…' : 'Regenerate'}
        </button>
      </footer>
    {/if}
  </div>
</HomeSection>

<style>
  .body {
    display: grid;
    gap: var(--space-3);
    padding: var(--density-row-block) var(--density-row-inline);
  }

  .content {
    display: grid;
    gap: var(--space-3);
  }

  .content:empty {
    display: none;
  }

  .message,
  .status,
  .sources {
    font-size: var(--font-size-sm);
    color: var(--ink-muted);
  }

  .status:empty {
    display: none;
  }

  .paragraph {
    line-height: var(--line-height-body);
  }

  .note {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-control);
    background: var(--warn-surface);
    color: var(--warn);
    font-size: var(--font-size-sm);
  }

  a {
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 0.15em;
  }

  a:hover {
    color: var(--ink-muted);
  }

  footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2) var(--space-3);
  }

  footer .sources {
    flex: 1 1 14rem;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-3);
  }

  .stale {
    color: var(--warn);
  }
</style>

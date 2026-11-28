<script lang="ts">
  import '#lib/auth-ui/auth-form.css';
  import { onMount, tick } from 'svelte';
  import { API_BASE_URL } from '$app/env/public';
  import { HttpBriefings } from '#lib/api/briefings/briefings.ts';
  import { MissionControlError } from '#lib/api/mission-control-error.ts';
  import { MissionControlEndpoint } from '#lib/api/mission-control-endpoint.ts';
  import { BriefingEventReader } from '#lib/briefing/briefing-event-reader.ts';
  import {
    BriefingRun,
    type BriefingRunState,
  } from '#lib/briefing/briefing-run.ts';
  import {
    type BriefingState,
    BriefingView,
  } from '#lib/briefing/briefing-view.ts';
  import { BriefingWording } from '#lib/briefing/briefing-wording.ts';
  import HomeSection from '#lib/home-ui/HomeSection.svelte';

  let { briefing, now }: { briefing: BriefingState; now: Date } = $props();

  const client = HttpBriefings.inBrowser({ baseUrl: API_BASE_URL });

  /** What the browser re-read, shown in place of the page's copy until the page loads again. */
  let reread = $state.raw<BriefingState | null>(null);
  let runState = $state.raw<BriefingRunState | null>(null);
  let starting = $state(false);
  let finished = $state('');
  let refusal = $state<string | null>(null);
  let button = $state<HTMLButtonElement>();
  let startedHere = false;
  let latestRead = 0;

  let view = $derived(new BriefingView({ state: reread ?? briefing, now }));
  let run = $derived(runState ?? BriefingRun.reconcile(view.running));
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
  });

  /** A quiet re-read keeps what's shown when Mission Control can't answer. */
  const refresh = async (props: { runEnded: boolean }) => {
    const ticket = ++latestRead;
    try {
      const briefings = await client.latest();
      if (ticket !== latestRead) return;
      reread = { status: 'loaded', briefings };
      runState = props.runEnded ? BriefingRun.idle() : null;
    } catch {
      return;
    }
  };

  const receive = async (message: Event) => {
    if (!(message instanceof MessageEvent)) return;
    const event = BriefingEventReader.read({
      type: message.type,
      data: message.data,
    });
    if (event === null) return;

    const step = BriefingRun.receive({ state: run, event });
    runState = step.state;
    if (step.finished === null) return;

    finished = BriefingWording.finished(step.finished);
    await refresh({ runEnded: true });
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
      if (run.phase === 'idle')
        runState = BriefingRun.requested(accepted.runId);
    } catch (error) {
      startedHere = false;
      refusal = BriefingWording.refusal(
        error instanceof MissionControlError ? error : null,
      );
      await refresh({ runEnded: false });
    } finally {
      starting = false;
    }
  };

  const refreshWhenVisible = () => {
    if (document.visibilityState === 'visible') {
      void refresh({ runEnded: false });
    }
  };

  onMount(() => {
    const source = new EventSource(
      new MissionControlEndpoint({ baseUrl: API_BASE_URL }).url('events'),
      { withCredentials: true },
    );
    let dropped = false;
    source.addEventListener('error', () => {
      dropped = true;
    });
    source.addEventListener('open', () => {
      if (!dropped) return;
      dropped = false;
      void refresh({ runEnded: false });
    });
    for (const type of BriefingEventReader.TYPES) {
      source.addEventListener(type, (message) => void receive(message));
    }
    return () => source.close();
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

  <div class="body" aria-busy={busy}>
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

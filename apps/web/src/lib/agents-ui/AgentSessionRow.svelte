<script lang="ts">
  import { AgentSessionActivity } from '#lib/agents/agent-session-activity.ts';
  import type { AgentSession } from '#lib/agents/agent-session-contracts.ts';
  import { AgentWording } from '#lib/agents/agent-wording.ts';
  import { SubagentRollup } from '#lib/agents/subagent-rollup.ts';
  import { RelativeTime } from '#lib/github-feed/relative-time.ts';
  import AgentActivityText from '#lib/agents-ui/AgentActivityText.svelte';
  import AgentStatePills from '#lib/agents-ui/AgentStatePills.svelte';
  import SubagentRow from '#lib/agents-ui/SubagentRow.svelte';

  let {
    session,
    now,
    focused,
  }: { session: AgentSession; now: Date; focused: boolean } = $props();

  const subagentsId = $props.id();

  let expanded = $state(false);
  let element: HTMLLIElement | undefined = $state();

  let key = $derived(AgentSessionActivity.key(session));
  let liveness = $derived(AgentSessionActivity.liveness(session));
  let reportedAt = $derived(AgentSessionActivity.lastReportedAt(session));
  let hasSubagents = $derived(session.subagents.length > 0);
  let kind = $derived(
    hasSubagents
      ? `${session.harness} · ${SubagentRollup.total(session.subagents)}`
      : session.harness,
  );
  let where = $derived(AgentWording.where(session.parent));
  let since = $derived.by(() => {
    void now;
    return RelativeTime.since(reportedAt);
  });

  $effect(() => {
    if (!focused) return;
    expanded = true;
    element?.scrollIntoView({ block: 'center' });
  });
</script>

<li
  class="session"
  bind:this={element}
  data-session-key={key}
  data-liveness={liveness}
  aria-current={focused ? 'true' : undefined}
>
  <div class="row">
    {#if hasSubagents}
      <button
        class="toggle"
        type="button"
        aria-expanded={expanded}
        aria-controls={expanded ? subagentsId : undefined}
        aria-label={`Subagents of ${session.reporterName}`}
        onclick={() => {
          expanded = !expanded;
        }}
      >
        <span class="chevron" aria-hidden="true">›</span>
      </button>
    {:else}
      <span class="toggle" aria-hidden="true"></span>
    {/if}
    <div class="who">
      <p class="name">{session.reporterName}</p>
      <p class="kind">{kind}</p>
      {#if hasSubagents}
        <p class="rollup">{SubagentRollup.phrase(session.subagents)}</p>
      {/if}
    </div>
    <div class="state">
      <AgentStatePills
        status={AgentSessionActivity.status(session)}
        {liveness}
      />
    </div>
    <div class="doing"><AgentActivityText activity={session.parent} /></div>
    <p class="where">{where ?? ''}</p>
    <time class="since" datetime={reportedAt.toISOString()}>{since}</time>
  </div>
  {#if hasSubagents && expanded}
    <ul class="subagents" id={subagentsId} aria-label="Subagents">
      {#each session.subagents as subagent (subagent.agentId)}
        <SubagentRow {subagent} {now} />
      {/each}
    </ul>
  {/if}
</li>

<style>
  .session {
    border-top: var(--border-hairline) solid var(--line);
  }

  .session[data-liveness='stale'] {
    box-shadow: inset var(--space-1) 0 0 var(--warn);
  }

  .session[data-liveness='lost'] {
    box-shadow: inset var(--space-1) 0 0 var(--bad);
  }

  .session[aria-current='true'] {
    background: var(--faint);
  }

  .row {
    display: grid;
    grid-template-columns:
      var(--touch-target) minmax(9rem, 1.3fr) auto minmax(0, 2.4fr)
      minmax(0, 1.1fr) auto;
    gap: var(--space-2) var(--space-3);
    align-items: start;
    padding: var(--density-row-block) var(--density-row-inline)
      var(--density-row-block) 0;
  }

  .toggle {
    display: grid;
    place-items: center;
    width: var(--touch-target);
    height: var(--touch-target);
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink-muted);
    cursor: pointer;
  }

  .chevron {
    font-size: var(--font-size-lg);
  }

  .toggle[aria-expanded='true'] .chevron {
    transform: rotate(90deg);
  }

  .who,
  .doing {
    min-width: 0;
  }

  .name {
    overflow-wrap: anywhere;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--ink);
  }

  .kind,
  .rollup {
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
  }

  .where {
    overflow-wrap: anywhere;
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
  }

  .since {
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
    white-space: nowrap;
  }

  .subagents {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  @media (width < 40rem) {
    .row {
      grid-template-columns: var(--touch-target) minmax(0, 1fr) auto;
    }

    .doing,
    .where {
      grid-column: 2 / -1;
    }

    .since {
      grid-column: 2 / -1;
    }

    .where:empty {
      display: none;
    }
  }
</style>

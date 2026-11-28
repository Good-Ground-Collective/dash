<script lang="ts">
  import type { Subagent } from '#lib/agents/agent-session-contracts.ts';
  import { RelativeTime } from '#lib/github-feed/relative-time.ts';
  import AgentActivityText from '#lib/agents-ui/AgentActivityText.svelte';
  import AgentStatePills from '#lib/agents-ui/AgentStatePills.svelte';

  let { subagent, now }: { subagent: Subagent; now: Date } = $props();

  let since = $derived.by(() => {
    void now;
    return RelativeTime.since(subagent.updatedAt);
  });
</script>

<li
  class="subagent"
  data-agent-id={subagent.agentId}
  data-liveness={subagent.liveness}
>
  <span class="arrow" aria-hidden="true">↳</span>
  <span class="name">{subagent.agentId}</span>
  <AgentStatePills status={subagent.status} liveness={subagent.liveness} />
  <div class="doing"><AgentActivityText activity={subagent} /></div>
  <time class="since" datetime={subagent.updatedAt.toISOString()}>{since}</time>
</li>

<style>
  .subagent {
    display: grid;
    grid-template-columns: auto minmax(8rem, 1fr) auto minmax(0, 2.4fr) auto;
    gap: var(--space-2) var(--space-3);
    align-items: start;
    padding: var(--space-2) var(--density-row-inline) var(--space-2)
      var(--space-6);
    border-top: var(--border-hairline) solid var(--line);
    background: var(--faint);
  }

  .subagent[data-liveness='stale'] {
    box-shadow: inset var(--space-1) 0 0 var(--warn);
  }

  .subagent[data-liveness='lost'] {
    box-shadow: inset var(--space-1) 0 0 var(--bad);
  }

  .arrow {
    color: var(--ink-muted);
  }

  .name {
    overflow-wrap: anywhere;
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--ink);
  }

  .doing {
    min-width: 0;
  }

  .since {
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
    white-space: nowrap;
  }

  @media (width < 40rem) {
    .subagent {
      grid-template-columns: auto minmax(0, 1fr) auto;
      padding-inline-start: var(--space-4);
    }

    .doing,
    .since {
      grid-column: 2 / -1;
    }
  }
</style>

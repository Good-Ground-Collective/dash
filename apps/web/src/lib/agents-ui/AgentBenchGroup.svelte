<script lang="ts">
  import { AgentSessionActivity } from '#lib/agents/agent-session-activity.ts';
  import type { AgentBenchGroup } from '#lib/agents/agent-bench-groups.ts';
  import AgentSessionRow from '#lib/agents-ui/AgentSessionRow.svelte';

  let {
    group,
    now,
    focusedKey,
  }: { group: AgentBenchGroup; now: Date; focusedKey: string | null } =
    $props();
</script>

<li class="bench" data-bench={group.benchId ?? ''}>
  <h3 class="heading">
    <span class="dot" aria-hidden="true"></span>
    {group.label}
    <span class="count">{group.sessions.length}</span>
  </h3>
  <ul class="sessions" aria-label={`Sessions on ${group.label}`}>
    {#each group.sessions as session (AgentSessionActivity.key(session))}
      <AgentSessionRow
        {session}
        {now}
        focused={AgentSessionActivity.key(session) === focusedKey}
      />
    {/each}
  </ul>
</li>

<style>
  .bench {
    list-style: none;
  }

  .heading {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--density-row-inline);
    background: var(--faint);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  .dot {
    width: var(--space-2);
    height: var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--ok);
  }

  .count {
    font-family: var(--font-mono);
    font-weight: var(--font-weight-regular);
  }

  .sessions {
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>

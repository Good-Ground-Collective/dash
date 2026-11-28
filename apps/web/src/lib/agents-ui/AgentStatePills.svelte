<script lang="ts">
  import type {
    AgentLiveness,
    AgentStatus,
  } from '#lib/agents/agent-session-contracts.ts';
  import { AgentWording } from '#lib/agents/agent-wording.ts';
  import AgentTonePill from '#lib/agents-ui/AgentTonePill.svelte';

  let {
    status,
    liveness,
  }: { status: AgentStatus | null; liveness: AgentLiveness } = $props();

  let flag = $derived(AgentWording.livenessPill(liveness));
</script>

<span class="pills">
  {#if status === null}
    <AgentTonePill label="Subagents only" tone="muted" />
  {:else}
    <AgentTonePill
      label={AgentWording.statusPill(status)}
      tone={AgentWording.statusTone(status)}
    />
  {/if}
  {#if flag !== null}
    <AgentTonePill
      label={flag}
      tone={AgentWording.livenessTone(liveness)}
      hint={AgentWording.livenessHint(liveness)}
    />
  {/if}
</span>

<style>
  .pills {
    display: inline-flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
</style>

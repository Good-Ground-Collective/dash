<script lang="ts">
  import type { AgentActivity } from '#lib/agents/agent-session-contracts.ts';
  import { AgentWording } from '#lib/agents/agent-wording.ts';

  let { activity }: { activity: AgentActivity | null } = $props();

  let errorText = $derived(
    activity === null ? null : AgentWording.errorText(activity),
  );
  let options = $derived(activity?.question?.options ?? []);
</script>

{#if activity !== null}
  {#if activity.summary !== null}
    <p class="summary">{activity.summary}</p>
  {/if}
  {#if activity.question !== null}
    <p class="question">
      <span class="label">Asking</span>
      {activity.question.text}
    </p>
    {#if options.length > 0}
      <ul class="options" aria-label="Options">
        {#each options as option, index (index)}
          <li class="option">{option.label}</li>
        {/each}
      </ul>
    {/if}
  {/if}
  {#if errorText !== null}
    <p class="error">{errorText}</p>
  {/if}
{/if}

<style>
  p {
    overflow-wrap: anywhere;
    font-size: var(--font-size-sm);
  }

  .summary {
    color: var(--ink);
  }

  .question {
    margin-top: var(--space-1);
    color: var(--warn);
  }

  .label {
    font-weight: var(--font-weight-semibold);
  }

  .error {
    margin-top: var(--space-1);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--bad);
  }

  .options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin: var(--space-1) 0 0;
    padding: 0;
    list-style: none;
  }

  .option {
    padding: var(--space-1) var(--space-2);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-pill);
    overflow-wrap: anywhere;
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
  }
</style>

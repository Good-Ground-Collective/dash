<script lang="ts">
  import type { AgentTone } from '#lib/agents/agent-wording.ts';

  let {
    label,
    tone,
    hint,
  }: { label: string; tone: AgentTone; hint?: string | null } = $props();
</script>

<span class="pill" data-tone={tone} title={hint ?? undefined}>{label}</span>

<style>
  .pill {
    display: inline-block;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--faint);
    color: var(--ink-muted);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    white-space: nowrap;
  }

  .pill[data-tone='ok'] {
    background: var(--ok-surface);
    color: var(--ok);
  }

  .pill[data-tone='warn'] {
    background: var(--warn-surface);
    color: var(--warn);
  }

  .pill[data-tone='bad'] {
    background: var(--bad-surface);
    color: var(--bad);
  }
</style>

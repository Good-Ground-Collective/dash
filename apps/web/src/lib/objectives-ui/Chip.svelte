<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ChipTone } from '#lib/objectives/chip-tones.ts';

  /** A small pill stating one fact about an objective; `dash` marks a value Dash set rather than the tracker. `plain` drops the weight for a quiet hint. */
  let {
    tone,
    dash = false,
    plain = false,
    children,
  }: {
    tone: ChipTone;
    dash?: boolean;
    plain?: boolean;
    children: Snippet;
  } = $props();
</script>

<span class="chip {tone}" class:dash class:plain>{@render children()}</span>

<style>
  .chip {
    flex: none;
    padding: 1px var(--space-2);
    border: var(--border-hairline) solid transparent;
    border-radius: var(--radius-pill);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    white-space: nowrap;
  }

  .dash {
    border-style: dashed;
    border-color: var(--ink-muted);
  }

  .p1 {
    background: var(--bad-surface);
    color: var(--bad);
  }

  .p2,
  .warn {
    background: var(--warn-surface);
    color: var(--warn);
  }

  .p3,
  .neutral {
    background: var(--faint);
    color: var(--ink-muted);
  }

  .hint {
    border-color: var(--line);
    color: var(--ink-muted);
  }

  .hint.plain {
    font-weight: var(--font-weight-regular);
  }
</style>

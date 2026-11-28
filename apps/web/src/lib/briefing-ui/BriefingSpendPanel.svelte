<script lang="ts">
  import type { BriefingState } from '#lib/briefing/briefing-view.ts';
  import { BriefingWording } from '#lib/briefing/briefing-wording.ts';

  let { briefing }: { briefing: BriefingState } = $props();

  let readout = $derived(
    briefing.status === 'loaded' && briefing.briefings.configured
      ? BriefingWording.spendReadout(briefing.briefings.budget)
      : null,
  );
</script>

{#if briefing.status === 'failed'}
  <p class="spend muted">{BriefingWording.spendUnavailable()}</p>
{:else if readout !== null}
  <section class="spend" aria-label="AI briefing spend">
    <p class="readout">{readout}</p>
    <p class="muted note">{BriefingWording.spendEstimateNote()}</p>
  </section>
{/if}

<style>
  .spend {
    display: grid;
    gap: var(--space-1);
    padding: 0 var(--density-row-inline);
    font-size: var(--font-size-sm);
  }

  .muted {
    color: var(--ink-muted);
  }
</style>

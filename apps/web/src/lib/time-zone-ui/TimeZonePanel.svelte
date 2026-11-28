<script lang="ts">
  import { TimeZoneWording } from '#lib/time-zone/time-zone-wording.ts';

  let { timeZone }: { timeZone: string } = $props();

  let label = $derived(TimeZoneWording.label(timeZone));
</script>

<section class="panel" aria-labelledby="time-zone-title">
  <header>
    <h2 id="time-zone-title">Time zone</h2>
    <p class="muted">
      Follows your browser. When you open Dash somewhere with a different time
      zone, Dash switches to it.
    </p>
  </header>

  <p class="zone">
    {#if label !== null}
      <span class="name">{label}</span>
      <span class="muted id">{timeZone}</span>
    {:else}
      <span class="name">{timeZone}</span>
    {/if}
  </p>
</section>

<style>
  .panel {
    display: grid;
    gap: var(--space-4);
    padding: var(--density-panel);
    background: var(--surface);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-panel);
  }

  h2 {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
  }

  .muted {
    color: var(--ink-muted);
  }

  header .muted {
    margin-top: var(--space-1);
  }

  .zone {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-2);
  }

  .name {
    font-weight: var(--font-weight-medium);
  }

  .id {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
  }
</style>

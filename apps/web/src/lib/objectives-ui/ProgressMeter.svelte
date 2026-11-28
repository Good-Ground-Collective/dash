<script lang="ts">
  import type { ObjectiveProgressView } from '#lib/objectives/objective-rows.ts';

  let { progress }: { progress: ObjectiveProgressView | null } = $props();
</script>

<span class="progress">
  {#if progress === null}
    <span class="label muted">No progress yet</span>
  {:else}
    <span class="track" aria-hidden="true">
      <span class="fill" style:width={`${progress.percent}%`}></span>
    </span>
    <span class="label" class:dash={progress.fromDash}>
      {progress.label}{#if progress.fromDash}<span class="visually-hidden">
          , set in Dash
        </span>{/if}
    </span>
  {/if}
</span>

<style>
  .progress {
    display: inline-grid;
    grid-template-columns: 5rem 13ch;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
  }

  .track {
    position: relative;
    width: 5rem;
    height: 0.375rem;
    overflow: hidden;
    border-radius: var(--radius-pill);
    background: var(--faint);
  }

  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: var(--radius-pill);
    background: var(--ok);
  }

  .label {
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }

  .muted {
    grid-column: 1 / -1;
    font-family: var(--font-body);
    color: var(--ink-muted);
    text-align: left;
  }

  .dash {
    text-decoration: underline dashed var(--ink-muted);
    text-underline-offset: 3px;
  }
</style>

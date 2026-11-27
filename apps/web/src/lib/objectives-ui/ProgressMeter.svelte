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
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .track {
    position: relative;
    flex: none;
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
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    white-space: nowrap;
  }

  .muted {
    font-family: var(--font-body);
    color: var(--ink-muted);
  }

  .dash {
    text-decoration: underline dashed var(--ink-muted);
    text-underline-offset: 3px;
  }
</style>

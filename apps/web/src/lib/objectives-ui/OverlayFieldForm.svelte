<script lang="ts">
  import type { Snippet } from 'svelte';
  import { enhance, type SubmitFunction } from '$app/forms';

  let {
    id,
    field,
    label,
    current,
    submitted,
    input,
  }: {
    id: string;
    field: 'manualProgress' | 'priority' | 'dueDate';
    label: string;
    /** Dash's value, shown in the input and clearable. */
    current: string | null;
    submitted: SubmitFunction;
    input: Snippet<[{ name: string; id: string; value: string }]>;
  } = $props();

  let inputId = $derived(`${field}-${id}`);
</script>

<div class="field">
  <form method="POST" action="?/overlay" use:enhance={submitted}>
    <input type="hidden" name="id" value={id} />
    <input type="hidden" name="field" value={field} />
    <label for={inputId}>{label}</label>
    <div class="controls">
      {@render input({ name: 'value', id: inputId, value: current ?? '' })}
      <button type="submit" class="button">Save</button>
    </div>
  </form>
  {#if current !== null}
    <form method="POST" action="?/overlay" use:enhance={submitted}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="value" value="" />
      <button type="submit" class="clear">
        Clear<span class="visually-hidden"> {label.toLowerCase()}</span>
      </button>
    </form>
  {/if}
</div>

<style>
  .field {
    display: grid;
    gap: var(--space-1);
  }

  form {
    display: grid;
    gap: var(--space-1);
  }

  label {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--ink-muted);
  }

  .controls {
    display: flex;
    gap: var(--space-2);
  }

  .controls :global(input),
  .controls :global(select) {
    flex: 1;
    min-width: 0;
    min-height: var(--touch-target);
    padding: 0 var(--space-2);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-control);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
  }

  .button {
    min-height: var(--touch-target);
    padding: 0 var(--space-3);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-control);
    background: var(--surface);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
  }

  .button:hover {
    border-color: var(--ink-muted);
  }

  .clear {
    justify-self: start;
    padding: 0;
    border: 0;
    background: none;
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
    text-decoration: underline;
    cursor: pointer;
  }
</style>

<script lang="ts">
  import '#lib/auth-ui/auth-form.css';

  let {
    label,
    labelHidden = false,
    value = $bindable(''),
    placeholder,
    busy,
    onSave,
    onCancel,
  }: {
    label: string;
    /** Keeps the label for screen readers only, where the row already shows which passkey it is. */
    labelHidden?: boolean;
    value?: string;
    placeholder?: string;
    busy: boolean;
    /** Gets the trimmed name. */
    onSave: (name: string) => void;
    onCancel?: () => void;
  } = $props();

  const id = $props.id();
  let input = $state<HTMLInputElement>();

  /** Moves focus to the name field, such as when the form first appears. */
  export function focus(): void {
    input?.focus();
  }

  const submit = (event: SubmitEvent): void => {
    event.preventDefault();
    onSave(value.trim());
  };
</script>

<form class="name-form" onsubmit={submit}>
  <label class:visually-hidden={labelHidden} for={id}>{label}</label>
  <div class="row">
    <input {id} bind:this={input} bind:value {placeholder} required />
    <button class="auth-button small" type="submit" disabled={busy}>
      Save
    </button>
    {#if onCancel}
      <button class="auth-button quiet small" type="button" onclick={onCancel}>
        Cancel
      </button>
    {/if}
  </div>
</form>

<style>
  .name-form {
    display: grid;
    flex: 1;
    gap: var(--space-1);
  }

  label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
  }

  .row {
    display: flex;
    gap: var(--space-2);
  }

  input {
    flex: 1;
    min-width: 0;
    min-height: var(--touch-target);
    padding: 0 var(--space-3);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-control);
    background: var(--bg);
  }
</style>

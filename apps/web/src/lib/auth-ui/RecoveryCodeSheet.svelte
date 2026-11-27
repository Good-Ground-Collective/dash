<script lang="ts">
  import '#lib/auth-ui/auth-form.css';
  import { RecoveryCodeFlow } from '#lib/auth/recovery-code-flow.ts';
  import type { RecoveryCodeSet } from '#lib/auth/recovery-codes.ts';

  let {
    set,
    error,
    busy,
    submitLabel,
    onConfirm,
    onCancel,
  }: {
    /** Shown once and kept only in this component's state. Key the sheet by `set.setId` so a new set starts unticked. */
    set: RecoveryCodeSet;
    error: string | null;
    busy: boolean;
    submitLabel: string;
    onConfirm: () => void;
    onCancel?: () => void;
  } = $props();

  const id = $props.id();
  let saved = $state(false);
  let copied = $state<'no' | 'yes' | 'failed'>('no');
  let list = $state<HTMLOListElement>();

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(RecoveryCodeFlow.text(set));
      copied = 'yes';
    } catch {
      copied = 'failed';
      const range = document.createRange();
      if (list !== undefined) range.selectNodeContents(list);
      document.getSelection()?.removeAllRanges();
      document.getSelection()?.addRange(range);
    }
  };

  const download = (): void => {
    const file = new Blob([RecoveryCodeFlow.text(set)], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dash-recovery-codes.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const submit = (event: SubmitEvent): void => {
    event.preventDefault();
    if (saved) onConfirm();
  };
</script>

<form class="auth-form sheet" onsubmit={submit}>
  <ol class="codes" aria-label="Recovery codes" bind:this={list}>
    {#each set.codes as code (code)}
      <li>{code}</li>
    {/each}
  </ol>
  <div class="actions">
    <button class="auth-button quiet" type="button" onclick={copy}>
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <rect x="9" y="9" width="12" height="12" rx="2" />
        <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
      </svg>
      {copied === 'yes' ? 'Copied' : 'Copy'}
    </button>
    <button class="auth-button quiet" type="button" onclick={download}>
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
      Download .txt
    </button>
  </div>
  <p class="visually-hidden" role="status">
    {#if copied === 'yes'}Codes copied.{/if}
  </p>
  {#if copied === 'failed'}
    <p class="hint" role="alert">
      Couldn’t copy. The codes are selected, so copy them yourself.
    </p>
  {/if}
  <label class="saved" for={`${id}-saved`}>
    <input id={`${id}-saved`} type="checkbox" bind:checked={saved} />
    I’ve saved these codes somewhere safe
  </label>
  {#if error}
    <p class="auth-error" role="alert">{error}</p>
  {/if}
  <div class="submit">
    <button class="auth-button" type="submit" disabled={!saved || busy}>
      {busy ? 'Saving…' : submitLabel}
    </button>
    {#if onCancel}
      <button
        class="auth-button quiet"
        type="button"
        disabled={busy}
        onclick={onCancel}
      >
        Cancel
      </button>
    {/if}
  </div>
</form>

<style>
  .sheet {
    gap: var(--space-4);
  }

  .codes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2) var(--space-4);
    margin: 0;
    padding: var(--space-4);
    list-style: none;
    background: var(--bg);
    border-radius: var(--radius-control);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.04em;
  }

  .actions,
  .submit {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .actions .auth-button {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-regular);
  }

  .submit .auth-button[type='submit'] {
    flex: 1;
  }

  .hint {
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
  }

  .saved {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    font-size: var(--font-size-sm);
    line-height: var(--line-height-body);
    cursor: pointer;
  }

  .saved input {
    flex: none;
    width: 1.125rem;
    height: 1.125rem;
    margin: 1px 0 0;
    accent-color: var(--ink);
  }

  .submit .auth-button[type='submit']:disabled {
    cursor: not-allowed;
  }
</style>

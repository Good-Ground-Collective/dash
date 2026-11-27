<script lang="ts">
  import KeyIcon from '#lib/auth-ui/KeyIcon.svelte';

  let {
    account,
    error,
    busy,
    onRegister,
  }: {
    /** The account's email, shown before the ceremony so a link for the wrong account is noticed. */
    account: string;
    error: string | null;
    busy: boolean;
    onRegister: () => void;
  } = $props();

  let button = $state<HTMLButtonElement>();

  /** Puts focus back on the button after a failed or cancelled prompt, so keyboard and screen reader users can try again. */
  export function focusButton(): void {
    button?.focus();
  }
</script>

<form
  class="auth-form"
  aria-describedby="recovery-account"
  onsubmit={(event) => {
    event.preventDefault();
    onRegister();
  }}
>
  <div class="account" id="recovery-account">
    <span class="account-label">Account</span>
    <span class="account-email">{account}</span>
  </div>
  {#if error}
    <p class="auth-error" role="alert">{error}</p>
  {/if}
  <p class="visually-hidden" role="status">
    {busy ? 'Waiting for your passkey…' : ''}
  </p>
  <button
    class="auth-button"
    type="submit"
    disabled={busy}
    aria-busy={busy}
    bind:this={button}
  >
    {#if busy}
      Waiting for your passkey…
    {:else}
      <KeyIcon /> Register passkey
    {/if}
  </button>
  <p class="note">
    Not your account? Don’t continue. <a href="/sign-in">Back to sign in</a>
  </p>
</form>

<style>
  .account {
    display: grid;
    gap: var(--space-1);
    padding: var(--space-3);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-control);
    background: var(--bg);
  }

  .account-label {
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
  }

  .account-email {
    font-weight: var(--font-weight-medium);
    overflow-wrap: anywhere;
  }

  .note {
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
  }
</style>

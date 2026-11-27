<script lang="ts">
  import '#lib/auth-ui/auth-form.css';
  import { tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { API_BASE_URL } from '$app/env/public';
  import { HttpPasskeyAuth } from '#lib/auth/passkey-auth.ts';
  import { passkeyWording } from '#lib/auth/passkey-wording.ts';
  import { RecoveryFlow, type RecoveryStep } from '#lib/auth/recovery-flow.ts';
  import AuthCard from '#lib/auth-ui/AuthCard.svelte';
  import RecoveryPasskey from '#lib/auth-ui/RecoveryPasskey.svelte';

  const flow = new RecoveryFlow({
    auth: HttpPasskeyAuth.inBrowser({ baseUrl: API_BASE_URL }),
    wording: passkeyWording,
  });

  let current = $state<RecoveryStep>(RecoveryFlow.start());
  let email = $state('');
  let code = $state('');
  let busy = $state(false);
  let waiting = $state(false);
  let codeInput = $state<HTMLInputElement>();
  let card = $state<AuthCard>();

  const problem = $derived(current.step === 'code' ? current.problem : null);

  /**
   * Runs one step. A refused code puts focus back in the code field; a move to a new screen
   * focuses its title, so the new screen is announced. Once done, the page stays busy until home
   * loads.
   */
  const advance = async (next: () => Promise<RecoveryStep>): Promise<void> => {
    const before = current.step;
    busy = true;
    try {
      current = await next();
    } catch (cause) {
      busy = false;
      throw cause;
    }
    if (current.step === 'done') {
      await goto('/', { invalidateAll: true });
      return;
    }
    busy = false;
    await tick();
    if (current.step === 'code' && current.problem !== null) {
      codeInput?.focus();
      codeInput?.select();
    } else if (current.step !== before) {
      card?.focusTitle();
    }
  };

  /** After too many tries, holds the button until Mission Control's wait is over, then clears the message. */
  $effect(() => {
    const wait = RecoveryFlow.waitMs(current, Date.now());
    waiting = wait > 0;
    if (!waiting) return;
    const timer = setTimeout(() => {
      current = RecoveryFlow.start();
    }, wait);
    return () => {
      clearTimeout(timer);
    };
  });
</script>

<svelte:head>
  <title>Use a recovery code · Dash</title>
</svelte:head>

{#if current.step === 'passkey'}
  {@const passkey = current}
  <AuthCard
    bind:this={card}
    title="Register a new passkey"
    lede="Your code was accepted. Register a passkey on this device to finish signing in."
  >
    <RecoveryPasskey
      account={passkey.prepared.account}
      error={passkey.error}
      {busy}
      onRegister={() => void advance(async () => flow.register(passkey))}
    />
  </AuthCard>
{:else}
  <AuthCard
    bind:this={card}
    title="Use a recovery code"
    lede="Each code works once. After it’s accepted, you’ll register a new passkey straight away."
  >
    <form
      class="auth-form"
      onsubmit={(event) => {
        event.preventDefault();
        void advance(async () => flow.redeem({ email, code }));
      }}
    >
      <div class="auth-field">
        <label for="recover-email">Email</label>
        <input
          id="recover-email"
          type="email"
          name="username"
          bind:value={email}
          required
          autocomplete="username"
          placeholder="you@example.com"
          aria-invalid={problem?.rejected === true}
          aria-describedby={problem ? 'recover-problem' : undefined}
        />
      </div>
      <div class="auth-field">
        <label for="recover-code">Recovery code</label>
        <input
          id="recover-code"
          class="mono code"
          bind:this={codeInput}
          bind:value={code}
          required
          autocomplete="one-time-code"
          autocapitalize="off"
          spellcheck="false"
          placeholder="xxxx-xxxx"
          aria-invalid={problem?.rejected === true}
          aria-describedby={problem ? 'recover-problem' : undefined}
        />
      </div>
      {#if problem}
        <p class="auth-error" id="recover-problem" role="alert">
          {problem.message}
        </p>
      {/if}
      <button class="auth-button" type="submit" disabled={busy || waiting}>
        {busy ? 'Checking your code…' : 'Continue to new passkey'}
      </button>
      <p class="note">
        No codes left? The break-glass command on the server prints a one-time
        sign-in link.
      </p>
      <a class="back" href="/sign-in">Back to sign in</a>
    </form>
  </AuthCard>
{/if}

<style>
  .auth-field input.code {
    font-size: var(--font-size-md);
    letter-spacing: 0.06em;
  }

  .note {
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
  }

  .back {
    justify-self: center;
    display: inline-flex;
    align-items: center;
    min-height: var(--touch-target);
    font-size: var(--font-size-sm);
    color: var(--ink-muted);
  }
</style>

<script lang="ts">
  import '#lib/auth-ui/auth-form.css';
  import { onMount, tick } from 'svelte';
  import { goto, replaceState } from '$app/navigation';
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

  let current = $state<RecoveryStep>(RecoveryFlow.opening());
  let busy = $state(false);
  let card = $state<AuthCard>();

  /** Runs one step and focuses the new screen's title, so it is announced. Once done, the page stays busy until home loads. */
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
    if (current.step !== before) card?.focusTitle();
  };

  /** The enrolment arrives in the fragment, which browsers never send. Take it, then drop it from the address bar and history. */
  onMount(() => {
    const { hash, pathname, search } = window.location;
    replaceState(`${pathname}${search}`, {});
    void advance(async () => flow.openLink({ hash }));
  });
</script>

<svelte:head>
  <title>Register a new passkey · Dash</title>
</svelte:head>

{#if current.step === 'passkey'}
  {@const passkey = current}
  <AuthCard
    bind:this={card}
    title="Register a new passkey"
    lede="This one-time link signs you in. Register a passkey on this device to finish."
  >
    <RecoveryPasskey
      account={passkey.prepared.account}
      error={passkey.error}
      {busy}
      onRegister={() => void advance(async () => flow.register(passkey))}
    />
  </AuthCard>
{:else if current.step === 'link-expired'}
  <AuthCard
    bind:this={card}
    title="This link has expired"
    lede="Sign-in links work once, for 15 minutes. Run the break-glass command on the server again for a new one, or use a recovery code."
  >
    <div class="actions">
      <a class="auth-button" href="/recover">Use a recovery code</a>
      <a class="auth-button quiet" href="/sign-in">Back to sign in</a>
    </div>
  </AuthCard>
{:else if current.step === 'link-missing'}
  <AuthCard
    bind:this={card}
    title="This link is incomplete"
    lede="It’s missing the part that signs you in. Copy the whole link the break-glass command printed, then open it again."
  >
    <div class="actions">
      <a class="auth-button" href="/recover">Use a recovery code</a>
      <a class="auth-button quiet" href="/sign-in">Back to sign in</a>
    </div>
  </AuthCard>
{:else if current.step === 'link-unavailable'}
  {@const unavailable = current}
  <AuthCard
    bind:this={card}
    title="Can’t check this link"
    lede="Dash couldn’t reach Mission Control. Your link still works until it expires."
  >
    <p class="auth-error" role="alert">{unavailable.error}</p>
    <button
      class="auth-button"
      type="button"
      disabled={busy}
      onclick={() =>
        void advance(async () =>
          flow.retryLink({ enrolment: unavailable.enrolment }),
        )}
    >
      Try again
    </button>
  </AuthCard>
{:else}
  <AuthCard bind:this={card} title="Checking your link">
    <p class="checking" role="status">One moment…</p>
  </AuthCard>
{/if}

<style>
  .actions {
    display: grid;
    gap: var(--space-2);
  }

  a.auth-button {
    text-decoration: none;
  }

  .checking {
    color: var(--ink-muted);
  }
</style>

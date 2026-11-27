<script lang="ts">
  import '#lib/auth-ui/auth-form.css';
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { API_BASE_URL } from '$app/env/public';
  import { HttpPasskeyAuth } from '#lib/auth/passkey-auth.ts';
  import { passkeyWording } from '#lib/auth/passkey-wording.ts';
  import {
    RecoveryCodeFlow,
    type RecoveryCodeStep,
  } from '#lib/auth/recovery-code-flow.ts';
  import { HttpRecoveryCodes } from '#lib/auth/recovery-codes.ts';
  import AuthCard from '#lib/auth-ui/AuthCard.svelte';
  import RecoveryCodeSheet from '#lib/auth-ui/RecoveryCodeSheet.svelte';

  const flow = new RecoveryCodeFlow({
    codes: HttpRecoveryCodes.inBrowser({ baseUrl: API_BASE_URL }),
    auth: HttpPasskeyAuth.inBrowser({ baseUrl: API_BASE_URL }),
    wording: passkeyWording,
  });

  let current = $state<RecoveryCodeStep>(RecoveryCodeFlow.start());
  let busy = $state(false);
  let card = $state<AuthCard>();

  /** Runs one request. When a new set appears, focus goes to the title so the step is announced again with the codes below it. Once confirmed, the page stays busy until home loads. */
  const advance = async (next: () => Promise<RecoveryCodeStep>) => {
    const before = current.step === 'saving' ? current.set.setId : null;
    busy = true;
    current = await next();
    if (current.step === 'confirmed') {
      await goto('/', { invalidateAll: true });
      return;
    }
    busy = false;
    await tick();
    if (current.step === 'saving' && current.set.setId !== before) {
      card?.focusTitle();
    }
  };

  const confirm = async (): Promise<void> => {
    const saving = current;
    if (saving.step !== 'saving') return;
    await advance(async () => flow.confirm(saving));
  };

  onMount(() => {
    void advance(async () => flow.generate());
  });
</script>

<svelte:head>
  <title>Save recovery codes · Dash</title>
</svelte:head>

<AuthCard
  bind:this={card}
  step="Step 3 of 4"
  title="Save your recovery codes"
  lede="If you lose your passkey, each code signs you in once so you can add a new one. You won’t see them again."
>
  {#if current.step === 'saving'}
    {#key current.set.setId}
      <RecoveryCodeSheet
        set={current.set}
        error={current.error}
        {busy}
        submitLabel="Continue"
        onConfirm={confirm}
      />
    {/key}
  {:else if current.step === 'confirmed'}
    <p class="muted" role="status">Saved. Opening Dash…</p>
  {:else if current.step === 'reauth'}
    <div class="auth-notice" role="alert">
      Confirm it’s you. Making recovery codes needs a sign-in from the last 15
      minutes.
    </div>
    {#if current.error}
      <p class="auth-error" role="alert">{current.error}</p>
    {/if}
    <button
      class="auth-button"
      disabled={busy}
      onclick={() => advance(async () => flow.reauthenticate())}
    >
      Confirm with a passkey
    </button>
  {:else if current.step === 'failed'}
    <p class="auth-error" role="alert">{current.error}</p>
    <button
      class="auth-button quiet"
      disabled={busy}
      onclick={() => advance(async () => flow.generate())}
    >
      Try again
    </button>
  {:else}
    <p class="muted" role="status">Making your codes…</p>
  {/if}
</AuthCard>

<style>
  .muted {
    color: var(--ink-muted);
  }
</style>

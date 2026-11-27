<script lang="ts">
  import '#lib/auth-ui/auth-form.css';
  import { tick } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { API_BASE_URL } from '$app/env/public';
  import type { RecoveryCodeStatus } from '#lib/api/mission-control.ts';
  import { HttpPasskeyAuth } from '#lib/auth/passkey-auth.ts';
  import { passkeyWording } from '#lib/auth/passkey-wording.ts';
  import {
    RecoveryCodeFlow,
    type RecoveryCodeStep,
  } from '#lib/auth/recovery-code-flow.ts';
  import { HttpRecoveryCodes } from '#lib/auth/recovery-codes.ts';
  import RecoveryCodeSheet from '#lib/auth-ui/RecoveryCodeSheet.svelte';

  let { status }: { status: RecoveryCodeStatus | null } = $props();

  const flow = new RecoveryCodeFlow({
    codes: HttpRecoveryCodes.inBrowser({ baseUrl: API_BASE_URL }),
    auth: HttpPasskeyAuth.inBrowser({ baseUrl: API_BASE_URL }),
    wording: passkeyWording,
  });

  /** `null` until Regenerate is pressed, and again once the new set is saved or cancelled. */
  let current = $state<RecoveryCodeStep | null>(null);
  let busy = $state(false);
  let announcement = $state('');
  let intro = $state<HTMLParagraphElement>();
  let regenerateButton = $state<HTMLButtonElement>();

  let low = $derived(
    status !== null && RecoveryCodeFlow.isRunningLow(status.remaining),
  );

  /** Runs one request. A new set moves focus to the line above it; a saved one is announced and focus returns to Regenerate. */
  const advance = async (next: () => Promise<RecoveryCodeStep>) => {
    const before = current?.step === 'saving' ? current.set.setId : null;
    busy = true;
    announcement = '';
    const step = await next();

    if (step.step === 'confirmed') {
      await invalidateAll();
      current = null;
      announcement = `New codes saved. Your old codes no longer work. ${RecoveryCodeFlow.remaining(step.remaining)}.`;
      busy = false;
      await tick();
      regenerateButton?.focus();
      return;
    }

    current = step;
    busy = false;
    await tick();
    if (step.step === 'saving' && step.set.setId !== before) intro?.focus();
  };

  const confirm = async (): Promise<void> => {
    const saving = current;
    if (saving?.step !== 'saving') return;
    await advance(async () => flow.confirm(saving));
  };

  const cancel = async (): Promise<void> => {
    current = null;
    await tick();
    regenerateButton?.focus();
  };
</script>

<section class="panel" aria-labelledby="recovery-codes-title">
  <header>
    <h2 id="recovery-codes-title">Recovery codes</h2>
    <p class="muted">
      If you lose every passkey, each code signs you in once so you can add a
      new one.
    </p>
  </header>

  {#if status === null}
    <p class="muted">
      Mission Control didn’t report your codes. Reload to try again.
    </p>
  {:else}
    <p class="count">{RecoveryCodeFlow.remaining(status.remaining)}</p>
    {#if low && current === null}
      <p class="auth-notice">
        You’re running low. Regenerate your codes so you don’t get locked out.
      </p>
    {/if}
  {/if}

  <p class="visually-hidden" role="status">{announcement}</p>

  {#if current?.step === 'saving'}
    <p class="intro" tabindex="-1" bind:this={intro}>
      Save these new codes. Your old codes keep working until you confirm.
    </p>
    {#key current.set.setId}
      <RecoveryCodeSheet
        set={current.set}
        error={current.error}
        {busy}
        submitLabel="Use these codes"
        onConfirm={confirm}
        onCancel={cancel}
      />
    {/key}
  {:else}
    {#if current?.step === 'reauth'}
      <div class="auth-notice reauth" role="alert">
        <span>
          Confirm it’s you. Making recovery codes needs a sign-in from the last
          15 minutes.
        </span>
        <button
          class="auth-button"
          disabled={busy}
          onclick={() => advance(async () => flow.reauthenticate())}
        >
          Confirm with a passkey
        </button>
      </div>
    {/if}
    {#if current?.step === 'reauth' && current.error}
      <p class="auth-error" role="alert">{current.error}</p>
    {:else if current?.step === 'failed'}
      <p class="auth-error" role="alert">{current.error}</p>
    {/if}
    <div>
      <button
        class="auth-button quiet"
        bind:this={regenerateButton}
        disabled={busy}
        onclick={() => advance(async () => flow.generate())}
      >
        {busy ? 'Making codes…' : 'Regenerate codes'}
      </button>
    </div>
  {/if}
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

  .count {
    font-weight: var(--font-weight-medium);
  }

  .intro:focus {
    outline: none;
  }

  .reauth {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }
</style>

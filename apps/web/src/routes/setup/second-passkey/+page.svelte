<script lang="ts">
  import '#lib/auth-ui/auth-form.css';
  import { onMount, tick } from 'svelte';
  import { API_BASE_URL } from '$app/env/public';
  import { afterSecondPasskeyPath } from '#lib/auth/onboarding-route.ts';
  import { HttpPasskeyAuth } from '#lib/auth/passkey-auth.ts';
  import { passkeyWording } from '#lib/auth/passkey-wording.ts';
  import {
    SecondPasskeyFlow,
    type SecondPasskeyStep,
  } from '#lib/auth/second-passkey-flow.ts';
  import AuthCard from '#lib/auth-ui/AuthCard.svelte';
  import PasskeyNameForm from '#lib/auth-ui/PasskeyNameForm.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const flow = new SecondPasskeyFlow({
    auth: HttpPasskeyAuth.inBrowser({ baseUrl: API_BASE_URL }),
    wording: passkeyWording,
  });

  let current = $state<SecondPasskeyStep>(SecondPasskeyFlow.start());
  let busy = $state(false);
  let name = $state('');
  let now = $state(new Date());
  let card = $state<AuthCard>();
  let addButton = $state<HTMLButtonElement>();
  let confirmButton = $state<HTMLButtonElement>();
  let nameForm = $state<PasskeyNameForm>();
  let continueLink = $state<HTMLAnchorElement>();

  /** Mounted from the start, so a screen reader announces each change to it. */
  let announcement = $derived.by(() => {
    if (current.step !== 'added') return '';
    return current.named
      ? 'Saved. You can rename it any time in settings.'
      : 'Added. Name it so you can tell it apart in settings.';
  });

  let rows = $derived(
    SecondPasskeyFlow.rows({ listed: data.passkeys ?? [], current }),
  );

  /**
   * Runs one request, then puts focus where the person carries on: back on the add button after a
   * cancelled or failed prompt, on the name field once a passkey is added, and on Continue once
   * it's named. The disabled button would otherwise leave focus on the page body.
   */
  const advance = async (
    next: () => Promise<SecondPasskeyStep>,
  ): Promise<void> => {
    busy = true;
    current = await next();
    busy = false;
    now = new Date();
    await tick();
    if (current.step === 'offer') addButton?.focus();
    else if (current.step === 'reauth') confirmButton?.focus();
    else if (current.named) continueLink?.focus();
    else nameForm?.focus();
  };

  const saveName = async (chosen: string): Promise<void> => {
    const added = current;
    if (added.step !== 'added') return;
    await advance(async () => flow.name(added, chosen));
  };

  onMount(() => {
    card?.focusTitle();
  });
</script>

<svelte:head>
  <title>Add a second passkey · Dash</title>
</svelte:head>

<AuthCard
  bind:this={card}
  step="Step 4 of 4 · optional"
  title="Add a second passkey"
  lede="A passkey on another device, like your phone, gets you in if this one is lost or wiped."
>
  {#if data.passkeys === null && current.step !== 'added'}
    <p class="muted">Mission Control didn’t list your passkeys.</p>
  {:else}
    <ul class="passkeys" aria-label="Your passkeys">
      {#each rows as passkey (passkey.id)}
        <li>
          <svg
            class="check"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <div class="passkey">
            <span class="name">{passkeyWording.label(passkey)}</span>
            <span class="muted detail">
              {passkeyWording.added(passkey, now)}
            </span>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  <p class="status" class:added={current.step === 'added'} role="status">
    {announcement}
  </p>

  {#if current.step === 'added'}
    {#if !current.named}
      <PasskeyNameForm
        bind:this={nameForm}
        label="Name this passkey"
        placeholder="Like “Phone”"
        bind:value={name}
        {busy}
        onSave={saveName}
      />
    {/if}
  {/if}

  {#if current.error}
    <p class="auth-error" role="alert">{current.error}</p>
  {/if}

  {#if current.step === 'added'}
    <a
      class="auth-button"
      bind:this={continueLink}
      href={afterSecondPasskeyPath}
    >
      Continue
    </a>
  {:else}
    {#if current.step === 'reauth'}
      <div class="auth-notice" role="alert">
        Confirm it’s you. Adding a passkey needs a sign-in from the last 15
        minutes.
      </div>
      <button
        class="auth-button"
        bind:this={confirmButton}
        disabled={busy}
        onclick={() => advance(async () => flow.reauthenticate())}
      >
        Confirm with a passkey
      </button>
    {:else}
      <button
        class="auth-button"
        bind:this={addButton}
        disabled={busy}
        aria-describedby="second-passkey-hint"
        onclick={() => advance(async () => flow.add())}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="6" y="2" width="12" height="20" rx="2" />
          <path d="M11 18h2" />
        </svg>
        Add a passkey on another device
      </button>
      <p class="hint" id="second-passkey-hint">
        Your browser shows a QR code to scan with your phone.
      </p>
    {/if}
    <a class="skip" href={afterSecondPasskeyPath}>Skip for now</a>
  {/if}
</AuthCard>

<style>
  .muted {
    color: var(--ink-muted);
  }

  .passkeys {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .passkeys li {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-control);
  }

  .check {
    flex: none;
    color: var(--ok);
  }

  .passkey {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .name {
    font-weight: var(--font-weight-medium);
    overflow-wrap: anywhere;
  }

  .detail,
  .hint {
    font-size: var(--font-size-xs);
  }

  .hint {
    margin-top: calc(var(--space-2) * -1);
    color: var(--ink-muted);
  }

  /* Out of the card's flow while empty, but still in the accessibility tree, so filling it is announced. */
  .status:empty {
    position: absolute;
  }

  .added {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-control);
    background: var(--ok-surface);
    color: var(--ok);
    font-size: var(--font-size-sm);
  }

  a.auth-button {
    text-decoration: none;
  }

  .skip {
    display: inline-flex;
    align-items: center;
    justify-self: center;
    min-height: var(--touch-target);
    font-size: var(--font-size-sm);
    color: var(--ink-muted);
  }

  .skip:hover {
    color: var(--ink);
  }
</style>

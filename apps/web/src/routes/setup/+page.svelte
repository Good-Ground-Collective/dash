<script lang="ts">
  import '#lib/auth-ui/auth-form.css';
  import { tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { API_BASE_URL } from '$app/env/public';
  import { HttpPasskeyAuth } from '#lib/auth/passkey-auth.ts';
  import { passkeyWording } from '#lib/auth/passkey-wording.ts';
  import { SetupFlow, type SetupStep } from '#lib/auth/setup-flow.ts';
  import AuthCard from '#lib/auth-ui/AuthCard.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const flow = new SetupFlow({
    auth: HttpPasskeyAuth.inBrowser({ baseUrl: API_BASE_URL }),
    wording: passkeyWording,
  });

  let current = $state<SetupStep>(SetupFlow.start());
  let token = $state('');
  let name = $state('');
  let email = $state('');
  let busy = $state(false);
  let tokenInput = $state<HTMLInputElement>();
  let card = $state<AuthCard>();

  /**
   * Runs one step's request. A rejected token puts focus back in the token field; any other move
   * to a new screen focuses its title, so the title and step are announced. Once done, the form
   * stays busy until home loads.
   */
  const advance = async (next: () => Promise<SetupStep>): Promise<void> => {
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
    if (current.step === 'token' && current.error !== null) {
      tokenInput?.focus();
    } else if (current.step !== before) {
      card?.focusTitle();
    }
  };

  const checkToken = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    await advance(async () => flow.checkToken({ token }));
  };

  const createAccount = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    if (current.step !== 'account') return;
    const checked = current.token;
    await advance(async () =>
      flow.createAccount({ token: checked, name, email }),
    );
  };
</script>

<svelte:head>
  <title>Set up · Dash</title>
</svelte:head>

{#if data.open === true && current.step === 'token'}
  <AuthCard
    bind:this={card}
    step="Step 1 of 4"
    title="Set up Dash"
    lede="Enter the setup token from Mission Control’s first-boot logs. It works once."
  >
    <form class="auth-form" onsubmit={checkToken}>
      <div class="auth-field">
        <label for="setup-token">Setup token</label>
        <input
          id="setup-token"
          class="mono"
          bind:this={tokenInput}
          bind:value={token}
          required
          autocomplete="off"
          spellcheck="false"
          placeholder="Paste the token"
          aria-invalid={current.error !== null}
          aria-describedby={current.error === null
            ? undefined
            : 'setup-token-error'}
        />
      </div>
      {#if current.error}
        <p class="auth-error" id="setup-token-error" role="alert">
          {current.error}
        </p>
      {/if}
      <button class="auth-button" type="submit" disabled={busy}>
        {busy ? 'Checking…' : 'Continue'}
      </button>
      <p class="footnote">
        Lost it? Run <code>
          bin/kamal app logs -c deploy/mission-control.yml
        </code>
        to print it again.
      </p>
    </form>
  </AuthCard>
{:else if data.open === true && current.step !== 'closed'}
  <AuthCard
    bind:this={card}
    step="Step 2 of 4"
    title="Create your account"
    lede="Dash signs you in with a passkey. There’s no password."
  >
    <form class="auth-form" onsubmit={createAccount}>
      <div class="auth-field">
        <label for="setup-name">Display name</label>
        <input id="setup-name" bind:value={name} required autocomplete="name" />
      </div>
      <div class="auth-field">
        <label for="setup-email">Email</label>
        <input
          id="setup-email"
          type="email"
          bind:value={email}
          required
          autocomplete="email"
        />
        <span class="hint">Used to identify you. Dash never emails you.</span>
      </div>
      {#if current.step === 'account' && current.error}
        <p class="auth-error" role="alert">{current.error}</p>
      {/if}
      <button class="auth-button" type="submit" disabled={busy}>
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
          <circle cx="8" cy="15" r="4" />
          <path d="m10.85 12.15 8.15-8.15M18 5l2 2M15 8l2 2" />
        </svg>
        {busy ? 'Waiting for your passkey…' : 'Register passkey'}
      </button>
    </form>
  </AuthCard>
{:else if data.open === false || current.step === 'closed'}
  <AuthCard
    bind:this={card}
    title="Setup is done"
    lede="Someone has already created the first account, so setup is closed."
  >
    <a class="auth-button" href="/sign-in">Sign in</a>
  </AuthCard>
{:else}
  <AuthCard
    title="Can’t reach Mission Control"
    lede="Dash couldn’t check whether setup is open. Make sure Mission Control is running, then reload."
  >
    <a class="auth-button quiet" href="/setup">Try again</a>
  </AuthCard>
{/if}

<style>
  a.auth-button {
    text-decoration: none;
  }

  .footnote {
    font-size: var(--font-size-xs);
    line-height: var(--line-height-body);
    color: var(--ink-muted);
  }

  .footnote code {
    font-family: var(--font-mono);
    overflow-wrap: anywhere;
  }
</style>

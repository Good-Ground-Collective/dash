<script lang="ts">
  import '#lib/auth-ui/auth-form.css';
  import { goto } from '$app/navigation';
  import { API_BASE_URL } from '$app/env/public';
  import { HttpPasskeyAuth } from '#lib/auth/passkey-auth.ts';
  import { passkeyWording } from '#lib/auth/passkey-wording.ts';
  import AuthCard from '#lib/auth-ui/AuthCard.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  let token = $state('');
  let name = $state('');
  let email = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    busy = true;
    error = null;
    try {
      await HttpPasskeyAuth.inBrowser({ baseUrl: API_BASE_URL }).setUp({
        token: token.trim(),
        name: name.trim(),
        email: email.trim(),
      });
      await goto('/', { invalidateAll: true });
    } catch (cause) {
      error = passkeyWording.explain(cause);
    } finally {
      busy = false;
    }
  };
</script>

<svelte:head>
  <title>Set up · Dash</title>
</svelte:head>

{#if data.open === true}
  <AuthCard
    title="Set up Dash"
    lede="Create the first account. You’ll sign in with a passkey on this device, so there’s no password to remember."
  >
    <form class="auth-form" onsubmit={submit}>
      <div class="auth-field">
        <label for="setup-token">Setup token</label>
        <input
          id="setup-token"
          class="mono"
          bind:value={token}
          required
          autocomplete="off"
          spellcheck="false"
        />
        <span class="hint">
          Mission Control logs it at boot until someone signs up.
        </span>
      </div>
      <div class="auth-field">
        <label for="setup-name">Your name</label>
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
        <span class="hint">
          Used to identify you if you ever need recovery.
        </span>
      </div>
      {#if error}
        <p class="auth-error" role="alert">{error}</p>
      {/if}
      <button class="auth-button" type="submit" disabled={busy}>
        {busy ? 'Waiting for your passkey…' : 'Create account with a passkey'}
      </button>
    </form>
  </AuthCard>
{:else if data.open === false}
  <AuthCard
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
</style>

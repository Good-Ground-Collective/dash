<script lang="ts">
  import '#lib/auth-ui/auth-form.css';
  import { browserSupportsWebAuthnAutofill } from '@simplewebauthn/browser';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { API_BASE_URL } from '$app/env/public';
  import { HttpPasskeyAuth } from '#lib/auth/passkey-auth.ts';
  import { passkeyWording } from '#lib/auth/passkey-wording.ts';
  import AuthCard from '#lib/auth-ui/AuthCard.svelte';
  import KeyIcon from '#lib/auth-ui/KeyIcon.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  let busy = $state(false);
  let error = $state<string | null>(null);

  const finish = async (): Promise<void> => {
    await goto('/', { invalidateAll: true });
  };

  const signIn = async (autofill: boolean): Promise<void> => {
    if (!autofill) {
      busy = true;
      error = null;
    }
    try {
      await HttpPasskeyAuth.inBrowser({ baseUrl: API_BASE_URL }).signIn({
        autofill,
      });
      await finish();
    } catch (cause) {
      if (!passkeyWording.isCancellation(cause)) {
        error = passkeyWording.explain(cause);
      }
    } finally {
      if (!autofill) busy = false;
    }
  };

  onMount(() => {
    void browserSupportsWebAuthnAutofill().then((supported) => {
      if (supported) void signIn(true);
    });
  });
</script>

<svelte:head>
  <title>Sign in · Dash</title>
</svelte:head>

<AuthCard title="Sign in">
  <form
    class="auth-form"
    onsubmit={(event) => {
      event.preventDefault();
      void signIn(false);
    }}
  >
    <div class="auth-field">
      <label for="sign-in-email">Email</label>
      <input
        id="sign-in-email"
        type="email"
        name="username"
        autocomplete="username webauthn"
        placeholder="you@example.com"
        aria-describedby="sign-in-email-hint"
      />
      <span class="hint" id="sign-in-email-hint">
        Your browser offers your passkey as you focus this field.
      </span>
    </div>
    {#if error}
      <p class="auth-error" role="alert">{error}</p>
    {/if}
    <button class="auth-button" type="submit" disabled={busy}>
      {#if busy}
        Waiting for your passkey…
      {:else}
        <KeyIcon /> Sign in with passkey
      {/if}
    </button>
  </form>
  {#snippet footer()}
    <p>Lost your passkey? <a href="/recover">Use a recovery code</a></p>
    {#if data.setupOpen}
      <p>First time here? <a href="/setup">Set up Dash</a></p>
    {/if}
  {/snippet}
</AuthCard>

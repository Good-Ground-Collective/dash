<script lang="ts">
  import '#lib/auth-ui/auth-form.css';
  import { onMount, tick } from 'svelte';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { API_BASE_URL } from '$app/env/public';
  import { HttpGithubAccounts } from '#lib/api/github-accounts.ts';
  import AuthCard from '#lib/auth-ui/AuthCard.svelte';
  import {
    type ConnectResult,
    ConnectResults,
  } from '#lib/connections/connect-results.ts';
  import ConnectGitHub from '#lib/connections-ui/ConnectGitHub.svelte';

  const accounts = HttpGithubAccounts.inBrowser({ baseUrl: API_BASE_URL });

  let card = $state<AuthCard>();
  let result = $state<ConnectResult | null>(null);

  /**
   * Focuses the title so the step is announced, then shows what the trip to GitHub did. The
   * banner fills its live region after mount so it's read out, and leaves the URL so a reload
   * doesn't show it again.
   */
  onMount(() => {
    card?.focusTitle();
    const url = new URL(page.url.href);
    const found = ConnectResults.fromUrl(url);
    const clean = ConnectResults.withoutResult(url);
    if (clean !== null) replaceState(clean, page.state);
    void tick().then(() => {
      result = found;
    });
  });
</script>

<svelte:head>
  <title>Connect GitHub · Dash</title>
</svelte:head>

<AuthCard
  bind:this={card}
  wide
  step="Connect · optional"
  title="Connect GitHub"
  lede="Choose which accounts Dash can read. Access is read-only, and you pick the repositories on GitHub."
>
  <ConnectGitHub {accounts} returnTo="/setup/github" {result} />
  <div class="actions">
    <a class="auth-button" href="/">Continue</a>
    <a class="skip" href="/">Skip for now</a>
  </div>
</AuthCard>

<style>
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
  }

  a.auth-button {
    padding: 0 var(--space-5);
    text-decoration: none;
  }

  .skip {
    display: inline-flex;
    align-items: center;
    min-height: var(--touch-target);
    color: var(--ink-muted);
  }
</style>

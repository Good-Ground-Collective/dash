<script lang="ts">
  import '#lib/auth-ui/auth-form.css';
  import type { Viewer } from '#lib/api/mission-control.ts';

  let {
    viewer,
    onSignOut,
  }: { viewer: Viewer; onSignOut: () => Promise<void> } = $props();
</script>

<section class="panel" aria-labelledby="account-title">
  <div>
    <h2 id="account-title">Account</h2>
    <p class="muted">Signed in as {viewer.name} · {viewer.email}</p>
  </div>
  <button class="auth-button quiet" onclick={onSignOut}>Sign out</button>
</section>

<style>
  .panel {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
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
</style>

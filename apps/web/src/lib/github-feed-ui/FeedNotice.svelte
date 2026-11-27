<script lang="ts">
  import { connectGithubPath } from '#lib/auth/onboarding-route.ts';

  let {
    kind,
  }: {
    /** `failed` when Mission Control didn't send the feed. */
    kind: 'failed' | 'not-connected' | 'first-sync';
  } = $props();
</script>

{#if kind === 'failed'}
  <div class="notice warn" role="alert">
    <p class="title">GitHub activity didn’t load</p>
    <p class="body">
      Mission Control didn’t send it. Reload to try again; the rest of Dash
      still works.
    </p>
  </div>
{:else if kind === 'not-connected'}
  <div class="notice">
    <p class="title">GitHub isn’t connected yet</p>
    <p class="body">
      Connect an account to see review requests, your pull requests, failed runs
      and assigned issues here.
    </p>
    <a class="action" href={connectGithubPath}>Connect GitHub</a>
  </div>
{:else}
  <div class="notice" role="status">
    <p class="title">Reading GitHub for the first time</p>
    <p class="body">
      Dash is reading your connected accounts. It usually takes a few minutes;
      reload to see what it found.
    </p>
  </div>
{/if}

<style>
  .notice {
    display: grid;
    justify-items: start;
    gap: var(--space-1);
    padding: var(--space-4);
    border: var(--border-hairline) dashed var(--line);
    border-radius: var(--radius-control);
  }

  .notice.warn {
    border-style: solid;
    border-color: transparent;
    background: var(--warn-surface);
  }

  .title {
    font-weight: var(--font-weight-medium);
  }

  .warn .title {
    color: var(--warn);
  }

  .body {
    color: var(--ink-muted);
    font-size: var(--font-size-sm);
  }

  .action {
    display: inline-flex;
    align-items: center;
    min-height: var(--touch-target);
    margin-top: var(--space-2);
    padding: 0 var(--space-4);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-control);
    background: var(--surface);
    color: var(--ink);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    text-decoration: none;
  }

  .action:hover {
    border-color: var(--ink-muted);
  }
</style>

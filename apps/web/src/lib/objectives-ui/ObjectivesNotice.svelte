<script lang="ts">
  import { connectGithubPath } from '#lib/auth/onboarding-route.ts';
  import {
    createProjectHelpUrl,
    type ObjectivesStatus,
  } from '#lib/objectives/objectives-view.ts';

  let { kind }: { kind: Exclude<ObjectivesStatus, 'ready'> } = $props();
</script>

{#if kind === 'failed'}
  <div class="notice warn" role="status">
    <p class="title">Objectives didn’t load</p>
    <p class="body">
      Mission Control didn’t send them. Reload to try again; the rest of home
      still works.
    </p>
  </div>
{:else if kind === 'not-connected'}
  <div class="notice">
    <p class="title">Connect GitHub to see your objectives</p>
    <p class="body">
      Dash reads initiatives and epics from GitHub Projects once an account is
      connected.
    </p>
    <a class="action" href={connectGithubPath}>Connect GitHub</a>
  </div>
{:else if kind === 'first-sync'}
  <div class="notice" role="status">
    <p class="title">Reading your Projects for the first time</p>
    <p class="body">
      Dash is reading initiatives and epics from GitHub. It usually takes a few
      minutes; reload to see what it found.
    </p>
  </div>
{:else if kind === 'filtered-out'}
  <div class="notice">
    <p class="title">No active initiatives</p>
    <p class="body">
      Everything is parked or done. Use the filters above to show them.
    </p>
  </div>
{:else}
  <div class="notice">
    <p class="title">No initiatives yet</p>
    <p class="body">
      An initiative is a Project in a GitHub organisation. Issues in it labelled
      <code>epic</code> become its epics, and their sub-issues are the tickets that
      track progress.
    </p>
    <p class="body">
      Add a <strong>Priority</strong> single-select field with options P1, P2
      and P3, and a <strong>Target date</strong> date field, and Dash will sort by
      them. Only Projects owned by an organisation can be read for now.
    </p>
    <a
      class="action"
      href={createProjectHelpUrl}
      target="_blank"
      rel="noreferrer"
    >
      How to create a Project<span class="visually-hidden">
        (opens GitHub)
      </span>
    </a>
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
    max-width: 40rem;
    color: var(--ink-muted);
    font-size: var(--font-size-sm);
  }

  strong {
    font-weight: var(--font-weight-medium);
    color: var(--ink);
  }

  code {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
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

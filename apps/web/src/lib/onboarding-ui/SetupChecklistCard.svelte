<script lang="ts">
  import type { SetupChecklist } from '#lib/onboarding/setup-checklist.ts';

  let { checklist }: { checklist: SetupChecklist } = $props();
</script>

<section class="card" aria-labelledby="setup-title">
  <header>
    <h2 id="setup-title">Finish setting up</h2>
    <span class="muted progress">{checklist.progress}</span>
  </header>
  <ol>
    {#each checklist.rows as row (row.id)}
      <li class:done={row.done}>
        {#if row.done}
          <span class="mark checked" aria-hidden="true">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <span class="text">
            <span class="title">{row.title}</span>
          </span>
          <span class="state">Done</span>
        {:else}
          <span class="mark" aria-hidden="true"></span>
          <span class="text">
            <span class="title">
              {row.title}<span class="visually-hidden">, not done yet</span>
            </span>
            <span class="muted body">{row.body}</span>
          </span>
          <a class="action" href={row.action.href}>{row.action.label}</a>
        {/if}
      </li>
    {/each}
  </ol>
  <p class="muted footnote">This list disappears once everything is done.</p>
</section>

<style>
  .card {
    display: grid;
    gap: var(--space-4);
    max-width: 40rem;
    padding: var(--space-5);
    background: var(--surface);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-panel);
  }

  header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
  }

  h2 {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    line-height: var(--line-height-tight);
  }

  .muted {
    color: var(--ink-muted);
  }

  .progress {
    font-size: var(--font-size-sm);
  }

  ol {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) 0;
  }

  li + li {
    border-top: var(--border-hairline) solid var(--line);
  }

  .mark {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 1.375rem;
    height: 1.375rem;
    border: var(--border-hairline) solid var(--ink-muted);
    border-radius: var(--radius-pill);
  }

  .checked {
    border-color: var(--ok);
    background: var(--ok);
    color: var(--surface);
  }

  .text {
    display: grid;
    flex: 1 1 14rem;
    gap: 2px;
    min-width: 0;
  }

  .title {
    font-weight: var(--font-weight-medium);
  }

  .done .title {
    font-weight: var(--font-weight-regular);
    color: var(--ink-muted);
    text-decoration: line-through;
  }

  .body {
    font-size: var(--font-size-sm);
  }

  .state {
    font-size: var(--font-size-xs);
    color: var(--ok);
  }

  .action {
    display: inline-flex;
    align-items: center;
    min-height: var(--touch-target);
    padding: 0 var(--space-4);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-control);
    background: var(--surface);
    color: var(--ink);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    text-decoration: none;
    white-space: nowrap;
  }

  .action:hover {
    border-color: var(--ink-muted);
  }

  .footnote {
    font-size: var(--font-size-xs);
  }
</style>

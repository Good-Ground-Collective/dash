<script lang="ts">
  import type { ObjectiveEntry } from '#lib/objectives/objectives-view.ts';
  import OverlayMenu from '#lib/objectives-ui/OverlayMenu.svelte';
  import ProgressMeter from '#lib/objectives-ui/ProgressMeter.svelte';

  let {
    epic,
    open,
    ontoggle,
  }: { epic: ObjectiveEntry; open: boolean; ontoggle: () => void } = $props();

  let row = $derived(epic.row);
  let panelId = $derived(`epic-${row.id}`);
</script>

<li class="epic" data-objective={row.id}>
  <div class="summary">
    <button
      type="button"
      class="toggle"
      aria-expanded={open}
      aria-controls={panelId}
      onclick={ontoggle}
    >
      <span class="chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
      {#if row.priority !== null}
        <span
          class="chip {row.priority.label.toLowerCase()}"
          class:dash={row.priority.fromDash}
        >
          {row.priority.label}
        </span>
      {/if}
      {#if row.status !== 'active'}
        <span class="chip neutral">
          {row.status === 'parked' ? 'Parked' : 'Done'}
        </span>
      {/if}
      <span class="title">{row.title}</span>
      <span class="meter"><ProgressMeter progress={row.progress} /></span>
      {#if row.due !== null}
        <span class="due" class:dash={row.due.fromDash}>{row.due.label}</span>
      {/if}
    </button>
    <OverlayMenu id={row.id} title={row.title} actions={epic.actions} />
  </div>
  {#if open}
    <div class="details" id={panelId}>
      {#if row.next !== null}
        <a class="line" href={row.next.href} target="_blank" rel="noreferrer">
          <span class="label">Next</span>
          {row.next.title}
        </a>
      {/if}
      {#if row.update !== null}
        <a class="line" href={row.update.href} target="_blank" rel="noreferrer">
          {row.update.text}
        </a>
      {/if}
      {#if row.dueAfterInitiative}
        <p class="line warn">Due after its initiative</p>
      {/if}
      {#each row.hints as hint (hint)}
        <p class="line">{hint}</p>
      {/each}
      <a class="line open" href={row.href} target="_blank" rel="noreferrer">
        Open on GitHub<span class="visually-hidden">: {row.title}</span>
      </a>
    </div>
  {/if}
</li>

<style>
  .epic {
    border-top: var(--border-hairline) solid var(--faint);
  }

  .summary {
    display: flex;
    align-items: center;
    padding-right: var(--space-2);
  }

  .toggle {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
    min-width: 0;
    min-height: var(--touch-target);
    padding: var(--space-2) var(--space-2) var(--space-2)
      var(--density-row-inline);
    border: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  .toggle:hover .title {
    text-decoration: underline;
  }

  .chevron {
    flex: none;
    width: 0.875rem;
    font-family: var(--font-mono);
    color: var(--ink-muted);
  }

  .chip {
    flex: none;
    padding: 1px var(--space-2);
    border: var(--border-hairline) solid transparent;
    border-radius: var(--radius-pill);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
  }

  .chip.dash,
  .due.dash {
    border-style: dashed;
    border-color: var(--ink-muted);
  }

  .p1 {
    background: var(--bad-surface);
    color: var(--bad);
  }

  .p2 {
    background: var(--warn-surface);
    color: var(--warn);
  }

  .p3,
  .neutral {
    background: var(--faint);
    color: var(--ink-muted);
  }

  .title {
    flex: 1 1 10rem;
    min-width: 0;
    overflow-wrap: anywhere;
    font-weight: var(--font-weight-medium);
  }

  .meter {
    flex: none;
    min-width: 10.5rem;
  }

  .due {
    flex: none;
    padding: 0 var(--space-1);
    border: var(--border-hairline) solid transparent;
    border-radius: var(--radius-pill);
    min-width: 6.5rem;
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
    text-align: right;
    white-space: nowrap;
  }

  .details {
    display: grid;
    gap: var(--space-1);
    min-width: 0;
    padding: 0 var(--density-row-inline) var(--space-3)
      calc(var(--density-row-inline) + 0.875rem + var(--space-3));
  }

  .line {
    overflow-wrap: anywhere;
    font-size: var(--font-size-sm);
    color: var(--ink-muted);
    text-decoration: none;
  }

  a.line:hover {
    color: var(--ink);
    text-decoration: underline;
  }

  .line.warn {
    color: var(--warn);
  }

  .line.open {
    font-weight: var(--font-weight-medium);
    color: var(--ink);
  }

  .label {
    margin-right: var(--space-1);
    font-size: var(--font-size-2xs);
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
</style>

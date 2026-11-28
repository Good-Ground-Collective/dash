<script lang="ts">
  import type { ObjectiveEntry } from '#lib/objectives/objectives-view.ts';
  import { ChipTones } from '#lib/objectives/chip-tones.ts';
  import Chip from '#lib/objectives-ui/Chip.svelte';
  import EpicTasks from '#lib/objectives-ui/EpicTasks.svelte';
  import DashFieldLabel from '#lib/objectives-ui/DashFieldLabel.svelte';
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
      aria-controls={open ? panelId : undefined}
      onclick={ontoggle}
    >
      <span class="lead">
        <span class="chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
        {#if row.priority !== null}
          <Chip
            tone={ChipTones.forPriority(row.priority.label)}
            dash={row.priority.fromDash}
          >
            <DashFieldLabel field={row.priority} />
          </Chip>
        {/if}
        {#if row.status !== 'active'}
          <Chip tone="neutral">
            {row.status === 'parked' ? 'Parked' : 'Done'}
          </Chip>
        {/if}
        <span class="title">{row.title}</span>
        {#if row.dueAfterInitiative}
          <Chip tone="warn">Due after its initiative</Chip>
        {/if}
        {#each row.hints as hint (hint)}
          <Chip tone="hint" plain>{hint}</Chip>
        {/each}
      </span>
      <span class="tail">
        <ProgressMeter progress={row.progress} />
        <span
          class="due"
          class:dash={row.due?.fromDash}
          class:empty={row.due === null}
        >
          {#if row.due !== null}<DashFieldLabel field={row.due} />{/if}
        </span>
      </span>
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
      <EpicTasks {row} />
      <a class="line open" href={row.href} target="_blank" rel="noreferrer">
        Open on GitHub<span class="visually-hidden">: {row.title}</span>
      </a>
    </div>
  {/if}
</li>

<style>
  .epic {
    container-type: inline-size;
    border-top: var(--border-hairline) solid var(--faint);
  }

  .summary {
    display: flex;
    align-items: center;
    padding-right: var(--space-2);
  }

  .toggle {
    display: grid;
    flex: 1;
    grid-template-columns: minmax(0, 1fr);
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

  .lead {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
    min-width: 0;
  }

  .chevron {
    flex: none;
    width: 0.875rem;
    font-family: var(--font-mono);
    color: var(--ink-muted);
  }

  .due.dash {
    border-style: dashed;
    border-color: var(--ink-muted);
  }

  .title {
    flex: 1 1 10rem;
    min-width: 0;
    overflow-wrap: anywhere;
    font-weight: var(--font-weight-medium);
  }

  .tail {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
    min-width: 0;
    padding-left: calc(0.875rem + var(--space-3));
  }

  .due {
    flex: none;
    padding: 0 var(--space-1);
    border: var(--border-hairline) solid transparent;
    border-radius: var(--radius-pill);
    box-sizing: content-box;
    width: 16ch;
    min-height: 1lh;
    overflow: hidden;
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    text-overflow: ellipsis;
    color: var(--ink-muted);
    text-align: right;
    white-space: nowrap;
  }

  @container (width >= 40rem) {
    .toggle {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .tail {
      padding-left: 0;
    }
  }

  @container (width < 26rem) {
    .due.empty {
      display: none;
    }
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

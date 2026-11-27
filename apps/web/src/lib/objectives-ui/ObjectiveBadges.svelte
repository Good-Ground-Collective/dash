<script lang="ts">
  import type { ObjectiveRow } from '#lib/objectives/objective-rows.ts';

  let { row }: { row: ObjectiveRow } = $props();
</script>

<span class="badges">
  {#if row.status !== 'active'}
    <span class="badge neutral">
      {row.status === 'parked' ? 'Parked' : 'Done'}
    </span>
  {/if}
  {#if row.priority !== null}
    <span
      class="badge priority {row.priority.label.toLowerCase()}"
      class:dash={row.priority.fromDash}
      title={row.priority.fromDash ? 'Set in Dash' : undefined}
    >
      {row.priority.label}{#if row.priority.fromDash}<span
          class="visually-hidden"
        >
          , set in Dash
        </span>{/if}
    </span>
  {/if}
  {#if row.due !== null}
    <span
      class="badge neutral"
      class:dash={row.due.fromDash}
      title={row.due.fromDash ? 'Set in Dash' : undefined}
    >
      {row.due.label}{#if row.due.fromDash}<span class="visually-hidden">
          , set in Dash
        </span>{/if}
    </span>
  {/if}
  {#if row.dueAfterInitiative}
    <span class="badge warn">Due after its initiative</span>
  {/if}
  {#each row.hints as hint (hint)}
    <span class="badge hint">{hint}</span>
  {/each}
</span>

<style>
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .badge {
    padding: 1px var(--space-2);
    border: var(--border-hairline) solid transparent;
    border-radius: var(--radius-pill);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    white-space: nowrap;
  }

  .badge.dash {
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

  .warn {
    background: var(--warn-surface);
    color: var(--warn);
  }

  .hint {
    border-color: var(--line);
    color: var(--ink-muted);
  }
</style>

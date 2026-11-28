<script lang="ts">
  import type { ObjectiveRow } from '#lib/objectives/objective-rows.ts';
  import { ChipTones } from '#lib/objectives/chip-tones.ts';
  import Chip from '#lib/objectives-ui/Chip.svelte';
  import DashFieldLabel from '#lib/objectives-ui/DashFieldLabel.svelte';

  let { row }: { row: ObjectiveRow } = $props();
</script>

<span class="badges">
  {#if row.status !== 'active'}
    <Chip tone="neutral">{row.status === 'parked' ? 'Parked' : 'Done'}</Chip>
  {/if}
  {#if row.priority !== null}
    <Chip
      tone={ChipTones.forPriority(row.priority.label)}
      dash={row.priority.fromDash}
    >
      <DashFieldLabel field={row.priority} />
    </Chip>
  {/if}
  {#if row.due !== null}
    <Chip tone="neutral" dash={row.due.fromDash}>
      <DashFieldLabel field={row.due} />
    </Chip>
  {/if}
  {#if row.dueAfterInitiative}
    <Chip tone="warn">Due after its initiative</Chip>
  {/if}
  {#each row.hints as hint (hint)}
    <Chip tone="hint">{hint}</Chip>
  {/each}
</span>

<style>
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
</style>

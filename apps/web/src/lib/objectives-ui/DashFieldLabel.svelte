<script lang="ts">
  import type { ObjectiveField } from '#lib/objectives/objective-rows.ts';

  /** A field's label, marked for sight and screen readers when Dash set it rather than the tracker. */
  let { field }: { field: ObjectiveField } = $props();
</script>

<span title={field.fromDash ? 'Set in Dash' : undefined}>
  {field.label}{#if field.fromDash}<span class="visually-hidden">
      , set in Dash
    </span>{/if}
</span>

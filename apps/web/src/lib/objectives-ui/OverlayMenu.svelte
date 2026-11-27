<script lang="ts">
  import { Popover } from 'bits-ui';
  import { enhance, type SubmitFunction } from '$app/forms';
  import { page } from '$app/state';
  import {
    type OverlayActionSet,
    overlayResultSchema,
  } from '#lib/objectives/overlay-actions.ts';
  import OverlayFieldForm from '#lib/objectives-ui/OverlayFieldForm.svelte';

  let {
    id,
    title,
    actions,
  }: { id: string; title: string; actions: OverlayActionSet } = $props();

  let open = $state(false);

  let failure = $derived.by(() => {
    const result = overlayResultSchema.safeParse(page.form);
    return result.success && result.data.overlay.id === id
      ? result.data.overlay.message
      : null;
  });

  let editable = $derived(
    actions.priority !== null ||
      actions.dueDate !== null ||
      actions.manualProgress !== null,
  );

  const submitted: SubmitFunction =
    () =>
    async ({ result, update }) => {
      await update({ reset: false });
      if (result.type === 'success') open = false;
    };
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <button {...props} class="trigger" aria-label={`Change ${title}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="12" r="2" fill="currentColor" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
          <circle cx="19" cy="12" r="2" fill="currentColor" />
        </svg>
      </button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content align="end" sideOffset={6} collisionPadding={12}>
      {#snippet child({ wrapperProps, props, open: shown })}
        {#if shown}
          <div {...wrapperProps}>
            <div {...props} class="panel">
              <p class="panel-title">{title}</p>
              {#if actions.park || actions.unpark}
                <form method="POST" action="?/overlay" use:enhance={submitted}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="field" value="parked" />
                  <input
                    type="hidden"
                    name="value"
                    value={String(actions.park)}
                  />
                  <button type="submit" class="button wide">
                    {actions.park ? 'Park' : 'Unpark'}
                  </button>
                </form>
              {/if}
              {#if actions.priority !== null}
                <OverlayFieldForm
                  {id}
                  field="priority"
                  label="Priority"
                  current={actions.priority.current}
                  {submitted}
                >
                  {#snippet input(field)}
                    <select {...field}>
                      <option value="">None</option>
                      <option value="P1">P1</option>
                      <option value="P2">P2</option>
                      <option value="P3">P3</option>
                    </select>
                  {/snippet}
                </OverlayFieldForm>
              {/if}
              {#if actions.dueDate !== null}
                <OverlayFieldForm
                  {id}
                  field="dueDate"
                  label="Due date"
                  current={actions.dueDate.current}
                  {submitted}
                >
                  {#snippet input(field)}
                    <input type="date" {...field} />
                  {/snippet}
                </OverlayFieldForm>
              {/if}
              {#if actions.manualProgress !== null}
                <OverlayFieldForm
                  {id}
                  field="manualProgress"
                  label="Progress (%)"
                  current={actions.manualProgress.current === null
                    ? null
                    : String(actions.manualProgress.current)}
                  {submitted}
                >
                  {#snippet input(field)}
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      inputmode="numeric"
                      {...field}
                    />
                  {/snippet}
                </OverlayFieldForm>
              {/if}
              {#if editable}
                <p class="note">GitHub’s own values always win over these.</p>
              {:else}
                <p class="note">
                  GitHub sets priority, due date and progress here.
                </p>
              {/if}
              {#if failure !== null}
                <p class="failure" role="alert">{failure}</p>
              {/if}
            </div>
          </div>
        {/if}
      {/snippet}
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

<style>
  .trigger {
    display: inline-grid;
    flex: none;
    place-items: center;
    width: var(--touch-target);
    height: var(--touch-target);
    border: 0;
    border-radius: var(--radius-control);
    background: none;
    color: var(--ink-muted);
    cursor: pointer;
  }

  .trigger:hover {
    background: var(--faint);
    color: var(--ink);
  }

  .panel {
    display: grid;
    gap: var(--space-3);
    width: min(18rem, calc(100vw - var(--space-6)));
    padding: var(--space-4);
    background: var(--surface);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-float);
  }

  .panel-title {
    overflow-wrap: anywhere;
    font-weight: var(--font-weight-semibold);
  }

  .button {
    min-height: var(--touch-target);
    padding: 0 var(--space-3);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-control);
    background: var(--surface);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
  }

  .button:hover {
    border-color: var(--ink-muted);
  }

  .wide {
    width: 100%;
  }

  .note {
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
  }

  .failure {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-control);
    background: var(--bad-surface);
    color: var(--bad);
    font-size: var(--font-size-sm);
  }
</style>

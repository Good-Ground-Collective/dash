<script lang="ts">
  import { Popover } from 'bits-ui';

  let { count = 0 }: { count?: number } = $props();
</script>

<div class="needs-you">
  <Popover.Root>
    <Popover.Trigger>
      {#snippet child({ props })}
        <button {...props} class="bubble" data-count={count}>
          <span class="label">Needs you</span>
          <span class="count" aria-label={`${count} waiting`}>{count}</span>
        </button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content side="top" align="start" sideOffset={8}>
        {#snippet child({ wrapperProps, props, open })}
          {#if open}
            <div {...wrapperProps}>
              <div {...props} class="panel">
                <h2 class="panel-title">Needs you</h2>
                <p class="empty">Nothing needs you right now.</p>
              </div>
            </div>
          {/if}
        {/snippet}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
</div>

<style>
  .needs-you {
    position: fixed;
    left: var(--space-5);
    bottom: var(--space-5);
    z-index: 20;
  }

  .bubble {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--touch-target);
    padding: 0 var(--space-2) 0 var(--space-4);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-pill);
    background: var(--surface);
    box-shadow: var(--shadow-float);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-medium);
    color: var(--ink);
    cursor: pointer;
  }

  .count {
    display: inline-grid;
    place-items: center;
    min-width: 1.75rem;
    height: 1.75rem;
    padding: 0 var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--faint);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
  }

  .bubble:not([data-count='0']) .count {
    background: var(--ink);
    color: var(--surface);
  }

  .panel {
    width: min(22rem, calc(100vw - var(--space-6)));
    padding: var(--space-4);
    background: var(--surface);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-float);
  }

  .panel-title {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
  }

  .empty {
    margin-top: var(--space-2);
    font-size: var(--font-size-sm);
    color: var(--ink-muted);
  }

  @media (width < 40rem) {
    .needs-you {
      left: var(--space-4);
      bottom: var(--space-4);
    }
  }
</style>

<script lang="ts">
  import { Dialog } from 'bits-ui';
</script>

<Dialog.Root>
  <Dialog.Trigger>
    {#snippet child({ props })}
      <button {...props} class="icon-button" aria-label="Search">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <circle
            cx="11"
            cy="11"
            r="6.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
          />
          <path
            d="m16 16 4 4"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
          />
        </svg>
      </button>
    {/snippet}
  </Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay>
      {#snippet child({ props })}
        <div {...props} class="scrim"></div>
      {/snippet}
    </Dialog.Overlay>
    <Dialog.Content>
      {#snippet child({ props })}
        <div {...props} class="search-panel">
          <Dialog.Title>
            {#snippet child({ props: titleProps })}
              <h2 {...titleProps} class="visually-hidden">Search</h2>
            {/snippet}
          </Dialog.Title>
          <label class="field">
            <span class="visually-hidden">Search Dash</span>
            <input type="search" placeholder="Search Dash" autocomplete="off" />
          </label>
          <Dialog.Description>
            {#snippet child({ props: descriptionProps })}
              <p {...descriptionProps} class="hint">
                Nothing to search yet. Objectives, agents and benches show up
                here once they exist.
              </p>
            {/snippet}
          </Dialog.Description>
        </div>
      {/snippet}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  .icon-button {
    display: inline-grid;
    place-items: center;
    width: var(--touch-target);
    height: var(--touch-target);
    padding: 0;
    border: var(--border-hairline) solid transparent;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--ink-muted);
    cursor: pointer;
  }

  .icon-button:hover {
    color: var(--ink);
    background: var(--faint);
  }

  .scrim {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: var(--scrim);
  }

  .search-panel {
    position: fixed;
    top: 12dvh;
    left: 50%;
    z-index: 50;
    width: min(36rem, calc(100vw - var(--space-6)));
    transform: translateX(-50%);
    padding: var(--space-3);
    background: var(--surface);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-float);
  }

  .field input {
    width: 100%;
    min-height: var(--touch-target);
    padding: 0 var(--space-3);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-control);
    background: var(--bg);
    font-size: var(--font-size-lg);
  }

  .field input::placeholder {
    color: var(--ink-muted);
  }

  .hint {
    padding: var(--space-3) var(--space-2) var(--space-1);
    font-size: var(--font-size-sm);
    color: var(--ink-muted);
  }
</style>

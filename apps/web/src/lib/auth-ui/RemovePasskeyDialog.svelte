<script lang="ts">
  import { AlertDialog } from 'bits-ui';

  let {
    label,
    disabled,
    onConfirm,
  }: { label: string; disabled: boolean; onConfirm: () => void } = $props();
</script>

<AlertDialog.Root>
  <AlertDialog.Trigger {disabled}>
    {#snippet child({ props })}
      <button {...props} class="auth-button quiet small">Remove</button>
    {/snippet}
  </AlertDialog.Trigger>
  <AlertDialog.Portal>
    <AlertDialog.Overlay>
      {#snippet child({ props })}
        <div {...props} class="scrim"></div>
      {/snippet}
    </AlertDialog.Overlay>
    <AlertDialog.Content>
      {#snippet child({ props })}
        <div {...props} class="dialog">
          <AlertDialog.Title>
            {#snippet child({ props: titleProps })}
              <h2 {...titleProps}>Remove “{label}”?</h2>
            {/snippet}
          </AlertDialog.Title>
          <AlertDialog.Description>
            {#snippet child({ props: descriptionProps })}
              <p {...descriptionProps}>
                You won’t be able to sign in to Dash with it any more. The
                passkey stays on the device until you delete it there.
              </p>
            {/snippet}
          </AlertDialog.Description>
          <div class="actions">
            <AlertDialog.Cancel>
              {#snippet child({ props: cancelProps })}
                <button {...cancelProps} class="auth-button quiet">Keep</button>
              {/snippet}
            </AlertDialog.Cancel>
            <AlertDialog.Action onclick={onConfirm}>
              {#snippet child({ props: actionProps })}
                <button {...actionProps} class="auth-button danger">
                  Remove passkey
                </button>
              {/snippet}
            </AlertDialog.Action>
          </div>
        </div>
      {/snippet}
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: var(--scrim);
  }

  .dialog {
    position: fixed;
    top: 20dvh;
    left: 50%;
    z-index: 50;
    display: grid;
    gap: var(--space-3);
    width: min(26rem, calc(100vw - var(--space-6)));
    transform: translateX(-50%);
    padding: var(--space-5);
    background: var(--surface);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-float);
  }

  h2 {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
  }

  p {
    color: var(--ink-muted);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }
</style>

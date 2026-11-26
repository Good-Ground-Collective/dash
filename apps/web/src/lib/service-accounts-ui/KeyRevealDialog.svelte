<script lang="ts">
  import { Dialog } from 'bits-ui';

  let {
    secret,
    accountName,
    onDone,
  }: { secret: string | null; accountName: string; onDone: () => void } =
    $props();

  let copied = $state<'no' | 'yes' | 'failed'>('no');
  let field = $state<HTMLInputElement | null>(null);

  const copy = async (): Promise<void> => {
    if (secret === null) return;
    try {
      await navigator.clipboard.writeText(secret);
      copied = 'yes';
    } catch {
      copied = 'failed';
      field?.select();
    }
  };

  const close = (): void => {
    copied = 'no';
    onDone();
  };
</script>

<Dialog.Root
  open={secret !== null}
  onOpenChange={(open) => {
    if (!open) close();
  }}
>
  <Dialog.Portal>
    <Dialog.Overlay>
      {#snippet child({ props })}
        <div {...props} class="scrim"></div>
      {/snippet}
    </Dialog.Overlay>
    <Dialog.Content interactOutsideBehavior="ignore">
      {#snippet child({ props })}
        <div {...props} class="dialog">
          <Dialog.Title>
            {#snippet child({ props: titleProps })}
              <h2 {...titleProps}>Copy the key for {accountName}</h2>
            {/snippet}
          </Dialog.Title>
          <Dialog.Description>
            {#snippet child({ props: descriptionProps })}
              <p {...descriptionProps}>
                This is the only time Dash shows it. Dash keeps a hash, so a
                lost key can’t be recovered: issue a new one instead.
              </p>
            {/snippet}
          </Dialog.Description>
          <div class="secret">
            <label class="visually-hidden" for="revealed-key">API key</label>
            <input
              id="revealed-key"
              class="key"
              readonly
              bind:this={field}
              value={secret ?? ''}
              onfocus={(event) => event.currentTarget.select()}
            />
            <button class="auth-button" type="button" onclick={copy}>
              {copied === 'yes' ? 'Copied' : 'Copy'}
            </button>
          </div>
          {#if copied === 'failed'}
            <p class="hint" role="status">
              Couldn’t copy. Select the key and copy it yourself.
            </p>
          {/if}
          <p class="hint">
            Send it as <code>Authorization: Bearer &lt;key&gt;</code>.
          </p>
          <div class="actions">
            <Dialog.Close>
              {#snippet child({ props: closeProps })}
                <button {...closeProps} class="auth-button quiet">
                  I’ve stored it
                </button>
              {/snippet}
            </Dialog.Close>
          </div>
        </div>
      {/snippet}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: var(--scrim);
  }

  .dialog {
    position: fixed;
    top: 18dvh;
    left: 50%;
    z-index: 50;
    display: grid;
    gap: var(--space-3);
    width: min(34rem, calc(100vw - var(--space-6)));
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

  .secret {
    display: flex;
    gap: var(--space-2);
  }

  .key {
    flex: 1;
    min-width: 0;
    min-height: var(--touch-target);
    padding: 0 var(--space-3);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-control);
    background: var(--faint);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
  }

  .hint {
    font-size: var(--font-size-sm);
  }

  code {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }
</style>

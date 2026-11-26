<script lang="ts">
  import { Checkbox, Dialog, RadioGroup } from 'bits-ui';
  import {
    type ApiKeyScope,
    apiKeyScopeSchema,
    type NewServiceAccount,
    type ServiceAccountKind,
    serviceAccountKindSchema,
  } from '#lib/api/service-account-contracts.ts';
  import { serviceAccountWording } from '#lib/service-accounts/service-account-wording.ts';

  let {
    open = $bindable(false),
    busy,
    error,
    onCreate,
  }: {
    open: boolean;
    busy: boolean;
    /** Why Mission Control refused the last create. The dialog stays open with what was typed. */
    error: string | null;
    onCreate: (input: NewServiceAccount) => void;
  } = $props();

  const kinds: readonly {
    value: ServiceAccountKind;
    label: string;
    detail: string;
  }[] = [
    {
      value: 'bench',
      label: 'Bench',
      detail:
        'One machine. Reports for any agent on it. The key never expires.',
    },
    {
      value: 'agent',
      label: 'Agent',
      detail:
        'An agent away from a bench, like CI. Reports only as itself. The key expires after 90 days.',
    },
  ];

  let kind = $state<ServiceAccountKind>('bench');
  let name = $state('');
  let identifier = $state('');
  let description = $state('');
  let scopes = $state<string[]>([...apiKeyScopeSchema.options]);

  let chosenScopes: ApiKeyScope[] = $derived(
    apiKeyScopeSchema.options.filter((scope) => scopes.includes(scope)),
  );

  const reset = (): void => {
    kind = 'bench';
    name = '';
    identifier = '';
    description = '';
    scopes = [...apiKeyScopeSchema.options];
  };

  const submit = (event: SubmitEvent): void => {
    event.preventDefault();
    const details = {
      name: name.trim(),
      description: description.trim(),
      scopes: chosenScopes,
    };
    onCreate(
      kind === 'bench'
        ? { kind, benchId: identifier.trim(), ...details }
        : { kind, agentName: identifier.trim(), ...details },
    );
  };

  $effect(() => {
    if (!open) reset();
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger>
    {#snippet child({ props })}
      <button {...props} class="auth-button">New service account</button>
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
        <div {...props} class="dialog">
          <Dialog.Title>
            {#snippet child({ props: titleProps })}
              <h2 {...titleProps}>New service account</h2>
            {/snippet}
          </Dialog.Title>
          <Dialog.Description>
            {#snippet child({ props: descriptionProps })}
              <p class="muted" {...descriptionProps}>
                Dash shows its first key once, when you create it.
              </p>
            {/snippet}
          </Dialog.Description>

          <form class="auth-form" onsubmit={submit}>
            <RadioGroup.Root
              class="kinds"
              aria-label="Kind"
              value={kind}
              onValueChange={(value) =>
                (kind = serviceAccountKindSchema.parse(value))}
            >
              {#each kinds as option (option.value)}
                <RadioGroup.Item value={option.value}>
                  {#snippet child({ props: itemProps, checked })}
                    <button
                      {...itemProps}
                      type="button"
                      class="kind"
                      class:checked
                    >
                      <span class="kind-label">{option.label}</span>
                      <span class="kind-detail">{option.detail}</span>
                    </button>
                  {/snippet}
                </RadioGroup.Item>
              {/each}
            </RadioGroup.Root>

            <div class="auth-field">
              <label for="account-name">Name</label>
              <input
                id="account-name"
                bind:value={name}
                maxlength="100"
                placeholder={kind === 'bench' ? 'Studio Mac' : 'CI reviewer'}
                required
              />
            </div>
            <div class="auth-field">
              <label for="account-identifier">
                {kind === 'bench' ? 'Bench ID' : 'Agent name'}
              </label>
              <input
                id="account-identifier"
                class="mono"
                bind:value={identifier}
                maxlength="100"
                pattern={'(?!\\.+$)[\\w.\\-]+'}
                placeholder={kind === 'bench' ? 'studio-mac' : 'ci-reviewer'}
                required
              />
              <span class="hint">
                Letters, digits, dots, dashes and underscores.
                {kind === 'bench'
                  ? 'One account per bench.'
                  : 'The key can report only as this agent.'}
              </span>
            </div>
            <div class="auth-field">
              <label for="account-description">What it’s for</label>
              <input
                id="account-description"
                bind:value={description}
                maxlength="500"
                placeholder={kind === 'bench'
                  ? 'The desk machine'
                  : 'Reviews pull requests in GitHub Actions'}
                required
              />
            </div>

            <fieldset class="scopes">
              <legend>Its keys may</legend>
              <Checkbox.Group bind:value={scopes} name="scopes">
                {#each apiKeyScopeSchema.options as scope (scope)}
                  <label class="scope">
                    <Checkbox.Root value={scope}>
                      {#snippet child({ props: boxProps, checked })}
                        <button
                          {...boxProps}
                          type="button"
                          class="box"
                          class:checked
                        >
                          {#if checked}
                            <svg viewBox="0 0 16 16" aria-hidden="true">
                              <path
                                d="M3.5 8.5l3 3 6-7"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                              />
                            </svg>
                          {/if}
                        </button>
                      {/snippet}
                    </Checkbox.Root>
                    <span>
                      <span class="scope-label">
                        {serviceAccountWording.scopeLabel(scope)}
                      </span>
                      <code>{scope}</code>
                      <span class="scope-detail">
                        {serviceAccountWording.scopeDescription(scope)}
                      </span>
                    </span>
                  </label>
                {/each}
              </Checkbox.Group>
            </fieldset>

            {#if error}
              <p class="auth-error" role="alert">{error}</p>
            {/if}
            <div class="actions">
              <Dialog.Close>
                {#snippet child({ props: closeProps })}
                  <button
                    {...closeProps}
                    type="button"
                    class="auth-button quiet"
                  >
                    Cancel
                  </button>
                {/snippet}
              </Dialog.Close>
              <button
                class="auth-button"
                type="submit"
                disabled={busy || chosenScopes.length === 0}
              >
                Create and show key
              </button>
            </div>
          </form>
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
    top: 50%;
    left: 50%;
    z-index: 50;
    display: grid;
    gap: var(--space-3);
    width: min(34rem, calc(100vw - var(--space-6)));
    max-height: calc(100dvh - var(--space-6));
    overflow-y: auto;
    transform: translate(-50%, -50%);
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

  .muted {
    color: var(--ink-muted);
  }

  :global(.kinds) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
  }

  .kind {
    display: grid;
    gap: var(--space-1);
    padding: var(--space-3);
    text-align: left;
    background: var(--bg);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-control);
    cursor: pointer;
  }

  .kind.checked {
    border-color: var(--ink);
    box-shadow: inset 0 0 0 var(--border-hairline) var(--ink);
  }

  .kind-label {
    font-weight: var(--font-weight-semibold);
  }

  .kind-detail,
  .scope-detail {
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
  }

  .scopes {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    margin-bottom: var(--space-2);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
  }

  .scope {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-1) 0;
    cursor: pointer;
  }

  .scope > span {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 var(--space-2);
  }

  .scope-label {
    font-weight: var(--font-weight-medium);
  }

  .scope-detail {
    flex-basis: 100%;
  }

  code {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
  }

  .box {
    display: inline-grid;
    flex: none;
    place-items: center;
    width: 1.25rem;
    height: 1.25rem;
    margin-top: var(--border-hairline);
    padding: 0;
    background: var(--bg);
    border: var(--border-hairline) solid var(--line);
    border-radius: calc(var(--radius-control) / 2);
    cursor: pointer;
  }

  .box.checked {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--bg);
  }

  .box svg {
    width: 0.875rem;
    height: 0.875rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-1);
  }
</style>

<script lang="ts">
  import '#lib/auth-ui/auth-form.css';
  import { Dialog } from 'bits-ui';
  import { enhance } from '$app/forms';
  import type { GithubFeedDefaultBranch } from '#lib/api/github-feed-contracts.ts';
  import type { WatchedChecks } from '#lib/api/watched-checks/watched-checks-contracts.ts';
  import {
    type CheckChoice,
    RepositoryCheckChoices,
  } from '#lib/watched-checks/repository-check-choices.ts';
  import { WatchedChecksForms } from '#lib/watched-checks/watched-checks-forms.ts';

  let {
    branch,
    chosen,
    message,
    onClose,
  }: {
    branch: GithubFeedDefaultBranch;
    chosen: WatchedChecks;
    message: string | null;
    onClose: () => void;
  } = $props();

  const rows = $derived(RepositoryCheckChoices.rows({ branch, chosen }));
  const options: { value: CheckChoice; label: string }[] = [
    { value: 'rules', label: 'Rules' },
    { value: 'watch', label: 'Watch' },
    { value: 'ignore', label: 'Ignore' },
  ];

  let saving = $state(false);
</script>

<Dialog.Root
  open={true}
  onOpenChange={(open) => {
    if (!open) onClose();
  }}
>
  <Dialog.Portal>
    <Dialog.Overlay>
      {#snippet child({ props })}
        <div {...props} class="scrim"></div>
      {/snippet}
    </Dialog.Overlay>
    <Dialog.Content>
      {#snippet child({ props })}
        <div {...props} class="dialog">
          <form
            method="POST"
            action="?/saveRepository"
            use:enhance={() => {
              saving = true;
              return async ({ result, update }) => {
                await update();
                saving = false;
                if (result.type === 'success') onClose();
              };
            }}
          >
            <input
              type="hidden"
              name="repository"
              value={branch.repository.fullName}
            />
            <header>
              <Dialog.Title>
                {#snippet child({ props: titleProps })}
                  <h2 {...titleProps}>{branch.repository.fullName}</h2>
                {/snippet}
              </Dialog.Title>
              <Dialog.Description>
                {#snippet child({ props: descriptionProps })}
                  <p {...descriptionProps}>
                    Checks from the latest run on <code>{branch.branch}</code>.
                    “Rules” follows the rules for every repo.
                  </p>
                {/snippet}
              </Dialog.Description>
            </header>

            <div class="checks">
              {#if rows.length === 0}
                <p class="empty">
                  The latest run on this branch has no checks to choose from.
                </p>
              {:else}
                <ul>
                  {#each rows as row (row.name)}
                    <li>
                      <div class="who">
                        <span class="check-name">{row.name}</span>
                        <span class="meta">
                          <span class:failing={row.failing}>{row.last}</span>
                          · {row.rulesWatch
                            ? 'Rules watch it'
                            : 'Rules don’t watch it'}
                        </span>
                      </div>
                      <fieldset class="choice">
                        <legend class="visually-hidden">
                          Watching {row.name}
                        </legend>
                        {#each options as option (option.value)}
                          <label class="segment">
                            <input
                              type="radio"
                              name={WatchedChecksForms.choiceField(row.name)}
                              value={option.value}
                              checked={row.choice === option.value}
                            />
                            <span>{option.label}</span>
                          </label>
                        {/each}
                      </fieldset>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>

            {#if message !== null}
              <p class="auth-error problem" role="alert">{message}</p>
            {/if}

            <footer>
              <button type="button" class="auth-button quiet" onclick={onClose}>
                Cancel
              </button>
              <button type="submit" class="auth-button" disabled={saving}>
                Save
              </button>
            </footer>
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
    grid-template-rows: minmax(0, 1fr);
    overflow: hidden;
    width: min(36rem, calc(100vw - var(--space-6)));
    max-height: calc(100dvh - var(--space-6));
    transform: translate(-50%, -50%);
    background: var(--surface);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-float);
  }

  form {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    min-height: 0;
  }

  header {
    display: grid;
    gap: var(--space-1);
    padding: var(--space-5) var(--space-5) var(--space-3);
  }

  h2 {
    overflow-wrap: anywhere;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
  }

  header p,
  .empty,
  .meta {
    color: var(--ink-muted);
  }

  code {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
  }

  .checks {
    min-height: 0;
    overflow-y: auto;
    padding: 0 var(--space-5);
    border-block: var(--border-hairline) solid var(--line);
  }

  .empty {
    padding: var(--space-4) 0;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) 0;
  }

  li + li {
    border-top: var(--border-hairline) solid var(--line);
  }

  .who {
    display: grid;
    flex: 1 1 10rem;
    gap: 2px;
    min-width: 0;
  }

  .check-name {
    overflow-wrap: anywhere;
    font-weight: var(--font-weight-medium);
  }

  .meta {
    font-size: var(--font-size-sm);
  }

  .failing {
    color: var(--bad);
  }

  .choice {
    display: flex;
    margin: 0;
    padding: 0;
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-control);
  }

  .segment {
    position: relative;
    display: grid;
  }

  .segment input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .segment span {
    display: grid;
    place-items: center;
    min-width: var(--touch-target);
    min-height: var(--touch-target);
    padding: 0 var(--space-3);
    border-radius: var(--radius-control);
    color: var(--ink-muted);
    font-weight: var(--font-weight-medium);
  }

  .segment input:checked + span {
    background: var(--ink);
    color: var(--bg);
  }

  .segment input:focus-visible + span {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  .problem {
    margin: var(--space-3) var(--space-5) 0;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-5);
  }

  @media (width < 40rem) {
    .dialog {
      inset: 0;
      width: 100%;
      max-height: none;
      height: 100dvh;
      transform: none;
      border: 0;
      border-radius: 0;
    }

    form {
      height: 100%;
    }

    header,
    footer {
      padding-inline: var(--space-4);
    }

    .problem {
      margin-inline: var(--space-4);
    }

    .checks {
      padding-inline: var(--space-4);
    }

    .choice {
      flex: 1 1 100%;
    }

    .segment {
      flex: 1 1 0;
    }

    footer .auth-button {
      flex: 1 1 0;
    }
  }
</style>

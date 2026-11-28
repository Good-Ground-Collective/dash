<script lang="ts">
  import '#lib/auth-ui/auth-form.css';
  import type {
    ConnectableAccount,
    OrganizationSuggestion,
  } from '#lib/api/github-account-contracts.ts';
  import type {
    OrganizationLookupOutcome,
    OrganizationRequestFlow,
  } from '#lib/connections/organization-request-flow.ts';

  let {
    flow,
    listed,
    suggestions,
    onfound,
    onrestart,
  }: {
    flow: OrganizationRequestFlow;
    /** What the list shows now, so a login already there isn't looked up. */
    listed: readonly ConnectableAccount[];
    /** Organisations with a public membership. Never the whole list. */
    suggestions: readonly OrganizationSuggestion[];
    /** A found organisation, to add to the list. */
    onfound: (entry: ConnectableAccount) => void;
    /** The grant or the session is gone, so the list starts over. */
    onrestart: (
      outcome: Exclude<
        OrganizationLookupOutcome,
        { kind: 'found' | 'problem' }
      >,
    ) => void;
  } = $props();

  let login = $state('');
  let busy = $state(false);
  let problem = $state<string | null>(null);

  let shown = $derived(
    suggestions.filter(
      (suggestion) =>
        !listed.some(
          ({ account }) =>
            account.login.toLowerCase() === suggestion.login.toLowerCase(),
        ),
    ),
  );

  const lookUp = async () => {
    if (busy) return;
    busy = true;
    problem = null;
    const outcome = await flow.lookUp({ login, listed });
    busy = false;

    if (outcome.kind === 'found') {
      login = '';
      onfound(outcome.entry);
    } else if (outcome.kind === 'problem') {
      problem = outcome.message;
    } else {
      onrestart(outcome);
    }
  };

  const pick = (suggestion: OrganizationSuggestion) => {
    login = suggestion.login;
    void lookUp();
  };
</script>

<form
  class="request"
  onsubmit={(event) => {
    event.preventDefault();
    void lookUp();
  }}
>
  <div class="auth-field">
    <label for="organisation-login">Request the app for an organisation</label>
    <div class="line">
      <input
        id="organisation-login"
        name="login"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        placeholder="acme"
        aria-invalid={problem !== null}
        aria-describedby="organisation-login-hint"
        bind:value={login}
      />
      <button class="auth-button quiet" type="submit" disabled={busy}>
        Find
      </button>
    </div>
    <span class="hint" id="organisation-login-hint">
      GitHub can’t tell Dash every organisation you’re in. Name one to ask its
      owners to install the app.
    </span>
  </div>
  <div role="alert" class="problem-region">
    {#if problem !== null}
      <p class="auth-error">{problem}</p>
    {/if}
  </div>
  {#if shown.length > 0}
    <div class="suggestions">
      <p class="hint" id="organisation-suggestions">
        Suggested from your public memberships
      </p>
      <ul aria-labelledby="organisation-suggestions">
        {#each shown as suggestion (suggestion.login)}
          <li>
            <button
              class="chip"
              type="button"
              disabled={busy}
              onclick={() => pick(suggestion)}
            >
              {#if suggestion.avatarUrl !== null}
                <img
                  src={suggestion.avatarUrl}
                  alt=""
                  width="16"
                  height="16"
                  referrerpolicy="no-referrer"
                />
              {/if}
              {suggestion.login}
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</form>

<style>
  .request,
  .suggestions {
    display: grid;
    gap: var(--space-2);
  }

  .line {
    display: flex;
    gap: var(--space-2);
  }

  .line input {
    flex: 1 1 auto;
    min-width: 0;
  }

  .problem-region:empty {
    display: none;
  }

  .hint {
    font-size: var(--font-size-xs);
    line-height: var(--line-height-body);
    color: var(--ink-muted);
  }

  ul {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: var(--touch-target);
    padding: 0 var(--space-3);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-pill);
    background: var(--surface);
    color: var(--ink);
    font-size: var(--font-size-sm);
    cursor: pointer;
  }

  .chip:disabled {
    opacity: 0.6;
    cursor: progress;
  }

  .chip img {
    border-radius: var(--radius-control);
  }
</style>

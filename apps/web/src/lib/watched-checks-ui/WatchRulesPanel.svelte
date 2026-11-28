<script lang="ts">
  import '#lib/auth-ui/auth-form.css';
  import { enhance } from '$app/forms';
  import type { GithubFeed } from '#lib/api/github-feed-contracts.ts';
  import type { WatchedChecks } from '#lib/api/watched-checks/watched-checks-contracts.ts';
  import { WatchedChecksView } from '#lib/watched-checks/watched-checks-view.ts';

  let {
    feed,
    chosen,
    message,
  }: { feed: GithubFeed; chosen: WatchedChecks; message: string | null } =
    $props();

  const rules = $derived(new WatchedChecksView({ feed, chosen }).rules);
</script>

<section class="panel" aria-labelledby="rules-title">
  <header>
    <h2 id="rules-title">Rules for every repo</h2>
    <p class="muted">
      A check name matches exactly, or add <code>*</code> at the end to match every
      name that starts the same way.
    </p>
  </header>

  {#if rules.length === 0}
    <p class="muted">
      No rules yet, so no repo is red on the GitHub page. Add one to start
      watching.
    </p>
  {:else}
    <ul class="list" aria-label="Watch rules">
      {#each rules as rule (rule.id)}
        <li>
          <div class="who">
            <code class="pattern">{rule.pattern}</code>
            <span class="detail">{rule.meaning}</span>
          </div>
          <span class="reach">{rule.reach}</span>
          <form method="POST" action="?/removeRule" use:enhance>
            <input type="hidden" name="id" value={rule.id} />
            <button type="submit" class="auth-button quiet small remove">
              Remove<span class="visually-hidden"> rule {rule.pattern}</span>
            </button>
          </form>
        </li>
      {/each}
    </ul>
  {/if}

  <form class="add" method="POST" action="?/addRule" use:enhance>
    <div class="auth-field">
      <label for="rule-pattern">Check name or prefix</label>
      <input
        id="rule-pattern"
        name="pattern"
        class="mono"
        placeholder="Deploy*"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        required
      />
    </div>
    <button type="submit" class="auth-button">Add rule</button>
  </form>

  {#if message !== null}
    <p class="auth-error" role="alert">{message}</p>
  {/if}
</section>

<style>
  .panel {
    display: grid;
    gap: var(--space-4);
    padding: var(--density-panel);
    background: var(--surface);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-panel);
  }

  h2 {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
  }

  .muted,
  .detail,
  .reach {
    color: var(--ink-muted);
  }

  header .muted {
    margin-top: var(--space-1);
  }

  code {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
  }

  .list {
    margin: 0;
    padding: 0;
    list-style: none;
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-control);
  }

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    padding: var(--density-row-block) var(--density-row-inline);
  }

  li + li {
    border-top: var(--border-hairline) solid var(--line);
  }

  .who {
    display: grid;
    flex: 1 1 12rem;
    gap: 2px;
    min-width: 0;
  }

  .pattern {
    overflow-wrap: anywhere;
    font-weight: var(--font-weight-medium);
  }

  .detail,
  .reach {
    font-size: var(--font-size-sm);
  }

  .remove {
    min-height: var(--touch-target);
  }

  .add {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: var(--space-3);
  }

  .add .auth-field {
    flex: 1 1 14rem;
  }

  @media (width < 40rem) {
    .add .auth-button {
      flex: 1 1 100%;
    }
  }
</style>

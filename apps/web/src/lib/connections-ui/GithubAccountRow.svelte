<script lang="ts">
  import type { GithubAccountRowView } from '#lib/connections/github-account-rows.ts';

  let { row }: { row: GithubAccountRowView } = $props();

  /** Falls back to initials when GitHub's avatar doesn't load. */
  let avatarFailed = $state(false);
</script>

<li class="row">
  <span class="avatar" class:rounded={row.rounded} aria-hidden="true">
    {#if row.avatarUrl !== null && !avatarFailed}
      <img
        src={row.avatarUrl}
        alt=""
        width="32"
        height="32"
        referrerpolicy="no-referrer"
        onerror={() => (avatarFailed = true)}
      />
    {:else}
      {row.initials}
    {/if}
  </span>
  <div class="who">
    <span class="login">{row.login}</span>
    <span class="role">{row.role}</span>
    {#if row.detail !== null}
      <span class="detail">{row.detail}</span>
    {/if}
  </div>
  <div class="state">
    {#if row.badge.kind === 'installed' || row.badge.kind === 'incomplete'}
      <span
        class="badge installed"
        class:incomplete={row.badge.kind === 'incomplete'}
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        {row.badge.label}
      </span>
    {:else if row.badge.kind === 'suspended'}
      <span class="badge suspended">{row.badge.label}</span>
    {/if}
    <a
      class={row.action.primary ? 'auth-button small' : 'quiet-link'}
      href={row.action.href}
    >
      {row.action.label}<span class="visually-hidden"> {row.login}</span>
    </a>
  </div>
</li>

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
  }

  .row:not(:first-child) {
    border-top: var(--border-hairline) solid var(--line);
  }

  .avatar {
    display: inline-grid;
    flex: none;
    place-items: center;
    width: 2rem;
    height: 2rem;
    overflow: hidden;
    border-radius: var(--radius-control);
    background: var(--char-neutral-bg);
    color: var(--char-neutral-fg);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
  }

  .avatar.rounded {
    border-radius: var(--radius-pill);
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .who {
    display: grid;
    flex: 1 1 10rem;
    gap: calc(var(--space-1) / 2);
    min-width: 0;
  }

  .login {
    overflow-wrap: anywhere;
    font-weight: var(--font-weight-medium);
  }

  .role,
  .detail {
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
  }

  .state {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-3);
    margin-left: auto;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--font-size-sm);
  }

  .badge.installed {
    color: var(--ok);
  }

  .badge.installed.incomplete {
    color: var(--warn);
  }

  .badge.suspended {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-pill);
    background: var(--warn-surface);
    color: var(--warn);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
  }

  a.auth-button {
    text-decoration: none;
  }

  .quiet-link {
    display: inline-flex;
    align-items: center;
    min-height: var(--touch-target);
    color: var(--ink-muted);
    font-size: var(--font-size-sm);
  }

  .quiet-link:hover {
    color: var(--ink);
  }
</style>

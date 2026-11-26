<script lang="ts">
  import type { Viewer } from '#lib/api/api-client.ts';
  import { Initials } from '#lib/shell/initials.ts';

  let { viewer }: { viewer: Viewer | null } = $props();
</script>

{#if viewer}
  <span
    class="avatar"
    role="img"
    aria-label={`Signed in as ${viewer.name}`}
    title={viewer.email}
  >
    {Initials.of(viewer.name)}
  </span>
{:else}
  <span class="avatar signed-out" role="img" aria-label="Signed out">
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <circle
        cx="12"
        cy="9"
        r="3.5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
      />
      <path
        d="M5.5 19a6.5 6.5 0 0 1 13 0"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
      />
    </svg>
  </span>
{/if}

<style>
  .avatar {
    display: inline-grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    margin: calc((var(--touch-target) - 2.25rem) / 2);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-pill);
    background: var(--faint);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.02em;
    color: var(--ink);
  }

  .signed-out {
    color: var(--ink-muted);
  }
</style>

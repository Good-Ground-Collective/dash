<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    lede,
    step,
    children,
    footer,
  }: {
    title: string;
    lede: string;
    /** Where this screen sits in a multi-screen flow, such as "Step 1 of 4", shown above the title. */
    step?: string;
    children: Snippet;
    footer?: Snippet;
  } = $props();
</script>

<section class="auth" aria-labelledby="auth-title">
  <div class="card">
    <span class="mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22">
        <circle
          cx="8.5"
          cy="12"
          r="4"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
        />
        <path
          d="M12.5 12h8M17.5 12v3M20.5 12v2"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
        />
      </svg>
    </span>
    {#if step}
      <p class="step">{step}</p>
    {/if}
    <h1 id="auth-title">{title}</h1>
    <p class="lede">{lede}</p>
    {@render children()}
  </div>
  {#if footer}
    <div class="footer">{@render footer()}</div>
  {/if}
</section>

<style>
  .auth {
    display: grid;
    justify-items: center;
    gap: var(--space-4);
    padding-top: var(--space-6);
  }

  .card {
    display: grid;
    gap: var(--space-4);
    width: min(28rem, 100%);
    padding: var(--space-6);
    background: var(--surface);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-panel);
  }

  .mark {
    display: inline-grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: var(--radius-control);
    background: var(--ink);
    color: var(--surface);
  }

  .step {
    margin-bottom: calc(var(--space-2) * -1);
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
  }

  h1 {
    font-family: var(--font-display);
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    letter-spacing: -0.015em;
    line-height: var(--line-height-tight);
  }

  .lede {
    margin-top: calc(var(--space-2) * -1);
    color: var(--ink-muted);
  }

  .footer {
    font-size: var(--font-size-sm);
    color: var(--ink-muted);
  }
</style>

<svelte:head>
  <title>Home · Dash</title>
</svelte:head>

<section class="home" aria-labelledby="home-title">
  <h1 id="home-title">Home</h1>
  <div class="panel">
    <p class="empty-title">Nothing here yet</p>
    <p class="empty-body">
      Objectives, agents and benches will gather here as they come online.
    </p>
  </div>
</section>

<style>
  .home {
    display: grid;
    gap: var(--space-4);
  }

  h1 {
    font-family: var(--font-display);
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    letter-spacing: -0.015em;
    line-height: var(--line-height-tight);
  }

  .panel {
    padding: var(--space-6) var(--space-5);
    background: var(--surface);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-panel);
  }

  .empty-title {
    font-weight: var(--font-weight-medium);
  }

  .empty-body {
    margin-top: var(--space-1);
    color: var(--ink-muted);
  }
</style>

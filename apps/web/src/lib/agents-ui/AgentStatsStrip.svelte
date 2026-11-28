<script lang="ts">
  import type { AgentStats } from '#lib/agents/agent-sessions.ts';

  let { stats }: { stats: AgentStats } = $props();

  let tiles = $derived([
    { label: 'Active now', value: stats.active, tone: 'ok' },
    { label: 'Need you', value: stats.needYou, tone: 'warn' },
    { label: 'Stale or lost', value: stats.staleOrLost, tone: 'bad' },
  ] as const);
</script>

<dl class="stats" aria-label="Agent totals">
  {#each tiles as tile (tile.label)}
    <div class="tile" data-tone={tile.value > 0 ? tile.tone : 'none'}>
      <dt>{tile.label}</dt>
      <dd>{tile.value}</dd>
    </div>
  {/each}
</dl>

<style>
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr));
    gap: var(--space-3);
    margin: 0;
  }

  .tile {
    padding: var(--space-3) var(--space-4);
    background: var(--surface);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-panel);
  }

  dt {
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
  }

  dd {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    color: var(--ink);
  }

  .tile[data-tone='ok'] dd {
    color: var(--ok);
  }

  .tile[data-tone='warn'] dd {
    color: var(--warn);
  }

  .tile[data-tone='bad'] dd {
    color: var(--bad);
  }
</style>

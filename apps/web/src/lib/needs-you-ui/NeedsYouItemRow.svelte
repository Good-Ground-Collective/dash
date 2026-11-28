<script lang="ts">
  import { AgentSessionLink } from '#lib/agents/agent-session-link.ts';
  import { RelativeTime } from '#lib/github-feed/relative-time.ts';
  import type { NeedsYouItem } from '#lib/needs-you/needs-you-contracts.ts';
  import { NeedsYouWording } from '#lib/needs-you/needs-you-wording.ts';

  let {
    item,
    now,
    where,
  }: { item: NeedsYouItem; now: Date; where: string | null } = $props();

  let waiting = $derived.by(() => {
    void now;
    return RelativeTime.since(item.openedAt);
  });
  let options = $derived(item.question?.options ?? []);
  let sessionHref = $derived(AgentSessionLink.href(item));
</script>

<li class="item">
  <span class="pill">{NeedsYouWording.pill(item)}</span>
  <div class="body">
    <p class="headline">{NeedsYouWording.headline(item)}</p>
    {#if options.length > 0}
      <ul class="options" aria-label="Options">
        {#each options as option, index (index)}
          <li class="option">{option.label}</li>
        {/each}
      </ul>
    {/if}
    <p class="meta">
      <span class="agent">{NeedsYouWording.agent(item)}</span>
      <span aria-hidden="true">·</span>
      <span>{NeedsYouWording.place(where)}</span>
      <span aria-hidden="true">·</span>
      <time datetime={item.openedAt.toISOString()}>{waiting}</time>
    </p>
    <a class="session-link" href={sessionHref}>Go to session</a>
  </div>
</li>

<style>
  .item {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
    padding: var(--space-3) 0;
  }

  .item:not(:first-child) {
    border-top: var(--border-hairline) solid var(--line);
  }

  .pill {
    flex: none;
    margin-top: var(--space-1);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--warn-surface);
    color: var(--warn);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
  }

  .body {
    flex: 1 1 auto;
    min-width: 0;
  }

  .headline {
    overflow-wrap: anywhere;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--ink);
  }

  .options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin: var(--space-1) 0 0;
    padding: 0;
    list-style: none;
  }

  .option {
    padding: var(--space-1) var(--space-2);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-pill);
    overflow-wrap: anywhere;
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--space-1);
    margin-top: var(--space-1);
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
  }

  .session-link {
    display: inline-block;
    margin-top: var(--space-1);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--ink);
  }

  .agent {
    overflow-wrap: anywhere;
    font-family: var(--font-mono);
  }
</style>

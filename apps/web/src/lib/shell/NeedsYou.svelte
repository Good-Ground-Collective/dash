<script lang="ts">
  import { Popover } from 'bits-ui';
  import { onMount } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { ClockRefresh } from '#lib/home/clock-refresh.ts';
  import { getNeedsYouFeed } from '#lib/needs-you/needs-you-feed-context.ts';
  import NeedsYouItemRow from '#lib/needs-you-ui/NeedsYouItemRow.svelte';

  const feed = getNeedsYouFeed();

  let count = $derived(feed.count);
  let now = $state(new Date());
  let announcement = $state('');
  let announcedCount = feed.count;
  let open = $state(false);

  afterNavigate(() => {
    open = false;
  });

  $effect(() => {
    if (count === announcedCount) return;
    announcedCount = count;
    announcement = `${count} waiting`;
  });

  onMount(() =>
    new ClockRefresh({
      refresh: () => {
        now = new Date();
      },
      visibility: document,
    }).start(),
  );
</script>

<div class="needs-you">
  <p class="visually-hidden" aria-live="polite">{announcement}</p>
  <Popover.Root bind:open>
    <Popover.Trigger>
      {#snippet child({ props })}
        <button
          {...props}
          class="bubble"
          data-count={count}
          aria-label={`Needs you, ${count} waiting`}
        >
          <span class="label">Needs you</span>
          <span class="count">{count}</span>
        </button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content side="top" align="start" sideOffset={8}>
        {#snippet child({ wrapperProps, props, open })}
          {#if open}
            <div {...wrapperProps}>
              <div
                {...props}
                class="panel"
                aria-labelledby="needs-you-panel-title"
              >
                <h2 id="needs-you-panel-title" class="panel-title">
                  Needs you
                </h2>
                {#if count === 0}
                  <p class="empty">Nothing needs you right now.</p>
                {:else}
                  <ul class="items">
                    {#each feed.items as item (item.id)}
                      <NeedsYouItemRow {item} {now} where={feed.where(item)} />
                    {/each}
                  </ul>
                {/if}
              </div>
            </div>
          {/if}
        {/snippet}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
</div>

<style>
  .needs-you {
    position: fixed;
    left: calc(var(--space-5) + env(safe-area-inset-left));
    bottom: calc(var(--space-5) + env(safe-area-inset-bottom));
    z-index: 20;
  }

  .bubble {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--touch-target);
    padding: 0 var(--space-2) 0 var(--space-4);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-pill);
    background: var(--surface);
    box-shadow: var(--shadow-float);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-medium);
    color: var(--ink);
    cursor: pointer;
  }

  .count {
    display: inline-grid;
    place-items: center;
    min-width: 1.75rem;
    height: 1.75rem;
    padding: 0 var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--faint);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
  }

  .bubble:not([data-count='0']) {
    border-color: var(--warn);
  }

  .bubble:not([data-count='0']) .count {
    background: var(--warn-surface);
    color: var(--warn);
    font-weight: var(--font-weight-semibold);
  }

  .panel {
    width: min(26rem, calc(100vw - var(--space-6)));
    max-height: min(32rem, 70dvh);
    overflow-y: auto;
    padding: var(--space-4);
    background: var(--surface);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-float);
  }

  .panel-title {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
  }

  .empty {
    margin-top: var(--space-2);
    font-size: var(--font-size-sm);
    color: var(--ink-muted);
  }

  .items {
    margin: var(--space-2) 0 0;
    padding: 0;
    list-style: none;
  }

  @media (width < 40rem) {
    .needs-you {
      left: calc(var(--space-4) + env(safe-area-inset-left));
      bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
    }
  }
</style>

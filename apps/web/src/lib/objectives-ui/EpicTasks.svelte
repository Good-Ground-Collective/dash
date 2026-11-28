<script lang="ts">
  import type { ObjectiveRow } from '#lib/objectives/objective-rows.ts';

  let { row }: { row: ObjectiveRow } = $props();

  let tasks = $derived(row.tasks);
</script>

{#if tasks.items.length > 0}
  <ul class="tasks" aria-label={`Tasks in ${row.title}`}>
    {#each tasks.items as task (task.id)}
      <li class="task" class:done={task.done} data-task={task.id}>
        <span class="dot" aria-hidden="true"></span>
        <a class="title" href={task.href} target="_blank" rel="noreferrer">
          {task.title}
        </a>
        <span class="assignee">{task.assignee ?? '—'}</span>
        <span class="state">{task.stateLabel}</span>
      </li>
    {/each}
  </ul>
  {#if tasks.hiddenCount > 0}
    <a class="more" href={row.href} target="_blank" rel="noreferrer">
      {tasks.hiddenCount} more on GitHub<span class="visually-hidden">
        : {row.title}
      </span>
    </a>
  {/if}
{/if}

<style>
  .tasks {
    display: grid;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .task {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto 3.5rem;
    align-items: baseline;
    gap: var(--space-3);
    font-size: var(--font-size-sm);
  }

  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: var(--radius-pill);
    background: var(--ink-muted);
  }

  .done .dot {
    background: var(--ok);
  }

  .title {
    overflow-wrap: anywhere;
    color: var(--ink);
    text-decoration: none;
  }

  .title:hover,
  .more:hover {
    text-decoration: underline;
  }

  .done .title,
  .done .assignee,
  .done .state {
    color: var(--ink-muted);
  }

  .assignee,
  .state {
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
    white-space: nowrap;
  }

  .state {
    text-align: right;
  }

  .more {
    font-size: var(--font-size-sm);
    color: var(--ink-muted);
    text-decoration: none;
  }
</style>

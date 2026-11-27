<script lang="ts">
  import type { CharacterHue } from '#lib/theme/character-hue.ts';
  import CharacterAvatar from '#lib/theme-ui/CharacterAvatar.svelte';

  let {
    crew,
  }: {
    /** The agents that touched the work lately. Empty until heartbeats report them. */
    crew: readonly { name: string; hue: CharacterHue }[];
  } = $props();

  const shown = 4;
</script>

<span class="crew" role="group" aria-label="Crew">
  {#if crew.length === 0}
    <span class="empty">No crew yet</span>
  {:else}
    {#each crew.slice(0, shown) as member (member.name)}
      <span class="member" title={member.name}>
        <CharacterAvatar name={member.name} hue={member.hue} size="sm" />
        <span class="visually-hidden">{member.name}</span>
      </span>
    {/each}
    {#if crew.length > shown}
      <span class="more">+{crew.length - shown}</span>
    {/if}
  {/if}
</span>

<style>
  .crew {
    display: inline-flex;
    align-items: center;
    min-height: 1.625rem;
  }

  .member + .member {
    margin-left: calc(var(--space-2) * -1);
  }

  .member :global(.avatar) {
    box-shadow: 0 0 0 2px var(--surface);
  }

  .empty,
  .more {
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
  }

  .more {
    margin-left: var(--space-1);
  }
</style>

<script lang="ts">
  import { Initials } from '#lib/shell/initials.ts';
  import type { CharacterHue } from '#lib/theme/character-hue.ts';

  let {
    name,
    hue,
    size = 'md',
  }: {
    /** The bench or agent, shortened to initials. The avatar is decorative, so show the name beside it. */
    name: string;
    hue: CharacterHue;
    size?: 'sm' | 'md';
  } = $props();
</script>

<span
  class="avatar {size}"
  aria-hidden="true"
  style:background={`var(--char-${hue}-bg)`}
  style:color={`var(--char-${hue}-fg)`}
  data-hue={hue}
>
  {Initials.of(name)}
</span>

<style>
  .avatar {
    display: inline-grid;
    flex: none;
    place-items: center;
    border-radius: var(--radius-pill);
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.02em;
  }

  .md {
    width: 2rem;
    height: 2rem;
    font-size: var(--font-size-sm);
  }

  .sm {
    width: 1.625rem;
    height: 1.625rem;
    font-size: var(--font-size-xs);
  }
</style>

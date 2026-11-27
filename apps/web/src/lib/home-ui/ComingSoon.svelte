<script lang="ts">
  import HomeSection from '#lib/home-ui/HomeSection.svelte';

  let {
    id,
    title,
    message,
  }: {
    id: string;
    title: string;
    /** One line saying what will show here once its data arrives. */
    message: string;
  } = $props();
</script>

<HomeSection {id} {title}>
  <p class="soon">{message}</p>
</HomeSection>

<style>
  .soon {
    padding: var(--density-row-block) var(--density-row-inline);
    font-size: var(--font-size-sm);
    color: var(--ink-muted);
  }
</style>

<script lang="ts">
  let { title }: { title: string } = $props();
</script>

<svelte:head>
  <title>{title} · Settings · Dash</title>
</svelte:head>

<h1>{title}</h1>

<style>
  h1 {
    font-family: var(--font-display);
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    letter-spacing: -0.015em;
    line-height: var(--line-height-tight);
  }
</style>

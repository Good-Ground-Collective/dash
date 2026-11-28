<script lang="ts">
  import SettingsPageTitle from '#lib/settings-ui/SettingsPageTitle.svelte';
  import WatchedRepositoriesPanel from '#lib/watched-checks-ui/WatchedRepositoriesPanel.svelte';
  import WatchRulesPanel from '#lib/watched-checks-ui/WatchRulesPanel.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const message = $derived(form?.watched.message ?? null);
  const formName = $derived(form?.watched.form ?? null);
</script>

<SettingsPageTitle title="Watched checks" />

<p class="intro">
  Only watched checks turn a default branch red on the GitHub page. Rules apply
  to every repo; a repo can watch or ignore single checks on top of them.
</p>

{#if data.watched.status !== 'loaded'}
  <section class="panel" aria-label="Watched checks">
    <p class="muted">
      Mission Control didn’t send your repositories and rules. Reload to try
      again.
    </p>
  </section>
{:else}
  <WatchRulesPanel
    feed={data.watched.feed}
    chosen={data.watched.chosen}
    message={formName === 'addRule' || formName === 'removeRule'
      ? message
      : null}
  />
  <WatchedRepositoriesPanel
    feed={data.watched.feed}
    chosen={data.watched.chosen}
    message={formName === 'saveRepository' ? message : null}
    messageRepository={formName === 'saveRepository'
      ? (form?.watched.repository ?? null)
      : null}
  />
{/if}

<style>
  .intro,
  .muted {
    color: var(--ink-muted);
  }

  .panel {
    padding: var(--density-panel);
    background: var(--surface);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-panel);
  }
</style>

<script lang="ts">
  import GithubConnectionsPanel from '#lib/connections-ui/GithubConnectionsPanel.svelte';
  import SettingsPageTitle from '#lib/settings-ui/SettingsPageTitle.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<SettingsPageTitle title="GitHub connections" />

<GithubConnectionsPanel github={data.github} />

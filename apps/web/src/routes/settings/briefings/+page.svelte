<script lang="ts">
  import BriefingSpendPanel from '#lib/briefing-ui/BriefingSpendPanel.svelte';
  import SettingsPageTitle from '#lib/settings-ui/SettingsPageTitle.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<SettingsPageTitle title="Briefing spend" />

<BriefingSpendPanel briefing={data.briefing} />

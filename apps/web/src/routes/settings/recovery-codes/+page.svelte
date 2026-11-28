<script lang="ts">
  import RecoveryCodesPanel from '#lib/auth-ui/RecoveryCodesPanel.svelte';
  import SettingsPageTitle from '#lib/settings-ui/SettingsPageTitle.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<SettingsPageTitle title="Recovery codes" />

<RecoveryCodesPanel status={data.recoveryCodes} />

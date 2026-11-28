<script lang="ts">
  import { goto } from '$app/navigation';
  import { API_BASE_URL } from '$app/env/public';
  import { HttpPasskeyAuth } from '#lib/auth/passkey-auth.ts';
  import AccountPanels from '#lib/auth-ui/AccountPanels.svelte';
  import SettingsPageTitle from '#lib/settings-ui/SettingsPageTitle.svelte';
  import TimeZonePanel from '#lib/time-zone-ui/TimeZonePanel.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const auth = HttpPasskeyAuth.inBrowser({ baseUrl: API_BASE_URL });

  const signOut = async (): Promise<void> => {
    await auth.signOut();
    await goto('/sign-in', { invalidateAll: true });
  };
</script>

<SettingsPageTitle title="Profile and time zone" />

<TimeZonePanel timeZone={data.viewer.timeZone} />

<AccountPanels viewer={data.viewer} onSignOut={signOut} />

<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { API_BASE_URL } from '$app/env/public';
  import type { Viewer } from '#lib/api/mission-control.ts';
  import { HttpPasskeyAuth } from '#lib/auth/passkey-auth.ts';
  import type { BuildStamp } from '#lib/build/build-stamp.ts';
  import { Initials } from '#lib/shell/initials.ts';
  import { NavItems } from '#lib/shell/nav-items.ts';

  let { viewer, build }: { viewer: Viewer | null; build: BuildStamp } =
    $props();

  const signOut = async (): Promise<void> => {
    await HttpPasskeyAuth.inBrowser({ baseUrl: API_BASE_URL }).signOut();
    await goto('/sign-in', { invalidateAll: true });
  };
</script>

{#if viewer}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        <button
          {...props}
          class="avatar-button"
          aria-label={`Account, signed in as ${viewer.name}`}
          title={viewer.email}
        >
          <span class="avatar" aria-hidden="true">
            {Initials.of(viewer.name)}
          </span>
        </button>
      {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content align="end" sideOffset={8} collisionPadding={8}>
        {#snippet child({ wrapperProps, props })}
          <div {...wrapperProps}>
            <div {...props} class="menu">
              <DropdownMenu.Group>
                <DropdownMenu.GroupHeading>
                  {#snippet child({ props: headingProps })}
                    <div {...headingProps} class="who">
                      <span class="name">{viewer.name}</span>
                      <span class="detail">{viewer.email}</span>
                    </div>
                  {/snippet}
                </DropdownMenu.GroupHeading>
                <DropdownMenu.Separator class="separator" />
                <DropdownMenu.Item>
                  {#snippet child({ props: itemProps })}
                    <a
                      {...itemProps}
                      class="item"
                      href="/settings"
                      aria-current={NavItems.isCurrent({
                        pathname: page.url.pathname,
                        href: '/settings',
                      })
                        ? 'page'
                        : undefined}
                    >
                      Settings
                    </a>
                  {/snippet}
                </DropdownMenu.Item>
                <DropdownMenu.Item>
                  {#snippet child({ props: itemProps })}
                    <a
                      {...itemProps}
                      class="item"
                      href="/settings/service-accounts"
                    >
                      Service accounts
                    </a>
                  {/snippet}
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={signOut}>
                  {#snippet child({ props: itemProps })}
                    <div {...itemProps} class="item">Sign out</div>
                  {/snippet}
                </DropdownMenu.Item>
              </DropdownMenu.Group>
              <DropdownMenu.Separator class="separator" />
              <DropdownMenu.Group aria-label="Build">
                <div class="build">
                  {#if build.releaseUrl}
                    <DropdownMenu.Item>
                      {#snippet child({ props: itemProps })}
                        <a
                          {...itemProps}
                          class="stamp"
                          href={build.releaseUrl}
                          aria-label={`Release ${build.version}`}
                        >
                          {build.version}
                        </a>
                      {/snippet}
                    </DropdownMenu.Item>
                  {:else}
                    <span class="stamp">{build.version}</span>
                  {/if}
                  {#if build.commitUrl && build.shortCommit}
                    <DropdownMenu.Item>
                      {#snippet child({ props: itemProps })}
                        <a
                          {...itemProps}
                          class="stamp"
                          href={build.commitUrl}
                          aria-label={`Commit ${build.shortCommit}`}
                        >
                          {build.shortCommit}
                        </a>
                      {/snippet}
                    </DropdownMenu.Item>
                  {/if}
                </div>
              </DropdownMenu.Group>
            </div>
          </div>
        {/snippet}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
{:else}
  <a class="avatar-button" href="/sign-in" aria-label="Sign in">
    <span class="avatar signed-out" role="img" aria-label="Signed out">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <circle
          cx="12"
          cy="9"
          r="3.5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
        />
        <path
          d="M5.5 19a6.5 6.5 0 0 1 13 0"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
        />
      </svg>
    </span>
  </a>
{/if}

<style>
  .avatar-button {
    display: inline-grid;
    padding: 0;
    border: 0;
    border-radius: var(--radius-pill);
    background: none;
    font: inherit;
    text-decoration: none;
    cursor: pointer;
  }

  .avatar-button:hover .avatar,
  .avatar-button[data-state='open'] .avatar {
    border-color: var(--ink-muted);
  }

  .avatar {
    display: inline-grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    margin: calc((var(--touch-target) - 2.25rem) / 2);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-pill);
    background: var(--faint);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.02em;
    color: var(--ink);
  }

  .signed-out {
    color: var(--ink-muted);
  }

  .menu {
    position: relative;
    z-index: 30;
    width: 15rem;
    padding: 0.375rem;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-float);
  }

  .menu:focus-visible {
    outline: none;
  }

  .who {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    padding: var(--space-2) var(--space-3);
  }

  .name {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-medium);
    color: var(--ink);
  }

  .detail {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-xs);
    color: var(--ink-muted);
  }

  .menu :global(.separator) {
    height: var(--border-hairline);
    margin: var(--space-1) 0;
    background: var(--line);
  }

  .item {
    display: flex;
    align-items: center;
    min-height: 2.5rem;
    padding: 0 var(--space-3);
    border-radius: var(--radius-control);
    font-size: var(--font-size-md);
    color: var(--ink);
    text-decoration: none;
    cursor: pointer;
    user-select: none;
  }

  .item[data-highlighted] {
    background: var(--faint);
  }

  .build {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-1) 0.125rem;
  }

  .stamp {
    padding: var(--space-1) 0.375rem;
    border-radius: var(--radius-control);
    font-family: var(--font-mono);
    font-size: var(--font-size-2xs);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
    color: var(--ink-muted);
    text-decoration: none;
  }

  a.stamp[data-highlighted] {
    background: var(--faint);
    color: var(--ink);
  }
</style>

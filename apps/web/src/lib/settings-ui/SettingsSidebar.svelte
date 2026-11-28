<script lang="ts">
  import { page } from '$app/state';
  import {
    settingsGroups,
    SettingsSections,
  } from '#lib/settings/settings-sections.ts';
</script>

<nav class="sidebar" aria-label="Settings sections">
  {#each settingsGroups as group (group.label)}
    <div class="group">
      <span class="group-label">{group.label}</span>
      {#each group.sections as section (section.href)}
        <a
          class="item"
          href={section.href}
          aria-current={SettingsSections.isCurrent({
            pathname: page.url.pathname,
            href: section.href,
          })
            ? 'page'
            : undefined}
        >
          {section.label}
        </a>
      {/each}
    </div>
  {/each}
</nav>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .group-label {
    padding: 0 var(--space-2) var(--space-1);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  .item {
    display: flex;
    align-items: center;
    min-height: var(--touch-target);
    padding: 0 var(--space-2);
    border: var(--border-hairline) solid transparent;
    border-radius: var(--radius-control);
    color: var(--ink-muted);
    text-decoration: none;
  }

  .item:hover {
    color: var(--ink);
    background: var(--faint);
  }

  .item[aria-current='page'] {
    color: var(--ink);
    font-weight: var(--font-weight-medium);
    background: var(--surface);
    border-color: var(--line);
  }
</style>

<script lang="ts">
  import { RadioGroup } from 'bits-ui';
  import { invalidateAll } from '$app/navigation';
  import { API_BASE_URL } from '$app/env/public';
  import { HttpAppearanceStore } from '#lib/api/appearance-store.ts';
  import { getThemeContext } from '#lib/theme/theme-context.ts';
  import {
    type ColorMode,
    colorModeSchema,
    type ThemeName,
    themeNameSchema,
  } from '#lib/theme/theme-preference-reader.ts';

  const theme = getThemeContext();
  const store = HttpAppearanceStore.inBrowser({ baseUrl: API_BASE_URL });

  const themes: readonly { value: ThemeName; label: string }[] = [
    { value: 'characters', label: 'Characters' },
  ];
  const modes: readonly { value: ColorMode; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];

  let error = $state<string | null>(null);

  /** Shows the choice at once, then saves it. A refusal puts the saved appearance back. */
  const choose = async (change: {
    theme?: ThemeName;
    mode?: ColorMode;
  }): Promise<void> => {
    const next = { ...theme.current, ...change };
    error = null;
    theme.preview(next);
    try {
      await store.save(next);
      await invalidateAll();
    } catch {
      error = 'Mission Control didn’t save that. Try again.';
    } finally {
      theme.settle();
    }
  };
</script>

<section class="panel" aria-labelledby="appearance-title">
  <header>
    <h2 id="appearance-title">Appearance</h2>
    <p class="muted">Saved to your account, so every device opens the same.</p>
  </header>

  {#if error}
    <p class="auth-error" role="alert">{error}</p>
  {/if}

  {#if themes.length > 1}
    {@render choice({
      label: 'Theme',
      value: theme.current.theme,
      options: themes,
      onChange: (value) => choose({ theme: themeNameSchema.parse(value) }),
    })}
  {/if}
  {@render choice({
    label: 'Mode',
    value: theme.current.mode,
    options: modes,
    onChange: (value) => choose({ mode: colorModeSchema.parse(value) }),
  })}
</section>

{#snippet choice(props: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
})}
  <div class="row">
    <span class="label" id={`appearance-${props.label}`}>{props.label}</span>
    <RadioGroup.Root
      class="segments"
      orientation="horizontal"
      aria-labelledby={`appearance-${props.label}`}
      value={props.value}
      onValueChange={props.onChange}
    >
      {#each props.options as option (option.value)}
        <RadioGroup.Item value={option.value}>
          {#snippet child({ props: itemProps, checked })}
            <button {...itemProps} type="button" class="segment" class:checked>
              {option.label}
            </button>
          {/snippet}
        </RadioGroup.Item>
      {/each}
    </RadioGroup.Root>
  </div>
{/snippet}

<style>
  .panel {
    display: grid;
    gap: var(--space-4);
    padding: var(--density-panel);
    background: var(--surface);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-panel);
  }

  h2 {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
  }

  .muted {
    margin-top: var(--space-1);
    color: var(--ink-muted);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .label {
    font-weight: var(--font-weight-medium);
  }

  :global(.segments) {
    display: inline-flex;
    gap: var(--space-1);
    padding: var(--space-1);
    border: var(--border-hairline) solid var(--line);
    border-radius: var(--radius-control);
    background: var(--bg);
  }

  .segment {
    min-width: 5.5rem;
    min-height: calc(var(--touch-target) - var(--space-2));
    padding: 0 var(--space-4);
    border: 0;
    border-radius: calc(var(--radius-control) - var(--space-1));
    background: transparent;
    color: var(--ink-muted);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
  }

  .segment:hover {
    color: var(--ink);
  }

  .segment.checked {
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow-panel);
  }
</style>

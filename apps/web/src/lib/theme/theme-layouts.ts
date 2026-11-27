import type { Component, Snippet } from 'svelte';
import type { Viewer } from '#lib/api/mission-control.ts';
import type { BuildStamp } from '#lib/build/build-stamp.ts';
import type { ThemeName } from '#lib/theme/theme-preference-reader.ts';

export interface ThemeLayoutProps {
  viewer: Viewer | null;
  build: BuildStamp;
  children: Snippet;
}

export type ThemeLayout = Component<ThemeLayoutProps>;

/** The page layout each theme renders in. A theme may bring its own; the rest share the app shell. */
export interface ThemeLayouts {
  for(theme: ThemeName): ThemeLayout;
}

export class SharedThemeLayouts implements ThemeLayouts {
  private readonly own: Partial<Record<ThemeName, ThemeLayout>>;
  private readonly shared: ThemeLayout;

  constructor(props: {
    shared: ThemeLayout;
    own: Partial<Record<ThemeName, ThemeLayout>>;
  }) {
    this.shared = props.shared;
    this.own = props.own;
  }

  for(theme: ThemeName): ThemeLayout {
    return this.own[theme] ?? this.shared;
  }
}

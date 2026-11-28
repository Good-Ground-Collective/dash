import { z } from 'zod';

import {
  type WatchMode,
  type WatchSource,
  watchOverrideSchema,
  watchPatternSchema,
} from '#src/github-feed/contracts/watched-checks.ts';

const watchedCheckPolicyPropsSchema = z.object({
  rules: z.array(watchPatternSchema).readonly().default([]),
  overrides: z.array(watchOverrideSchema).readonly().default([]),
});

/**
 * Which checks a person watches. A check is watched when its repository says to watch it,
 * or a rule matches its name and the repository doesn't say to ignore it. A repository's own
 * word always beats the rules.
 */
export class WatchedCheckPolicy {
  private readonly rules: readonly string[];
  private readonly overrides: ReadonlyMap<string, WatchMode>;

  constructor(input: z.input<typeof watchedCheckPolicyPropsSchema> = {}) {
    const props = watchedCheckPolicyPropsSchema.parse(input);
    this.rules = props.rules;
    this.overrides = new Map(
      props.overrides.map((override) => [
        WatchedCheckPolicy.keyOf(override),
        override.mode,
      ]),
    );
  }

  /** Why the check is watched, or null when it isn't. */
  watchSource(props: {
    repository: string;
    checkName: string;
  }): WatchSource | null {
    const override = this.overrides.get(WatchedCheckPolicy.keyOf(props));
    if (override === 'watch') {
      return 'repo';
    }
    if (override === 'ignore') {
      return null;
    }
    return this.rules.some((pattern) =>
      WatchedCheckPolicy.matches({ pattern, checkName: props.checkName }),
    )
      ? 'rule'
      : null;
  }

  /** Whether `pattern`, an exact name or a prefix ending in `*`, covers `checkName`. */
  static matches(props: { pattern: string; checkName: string }): boolean {
    if (props.pattern.endsWith('*')) {
      return props.checkName.startsWith(props.pattern.slice(0, -1));
    }
    return props.checkName === props.pattern;
  }

  private static keyOf(props: { repository: string; checkName: string }) {
    return `${props.repository}\u0000${props.checkName}`;
  }
}

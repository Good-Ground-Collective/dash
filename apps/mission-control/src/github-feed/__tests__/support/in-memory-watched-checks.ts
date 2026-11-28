import { randomUUID } from 'node:crypto';

import type {
  WatchMode,
  WatchOverride,
  WatchOverrideKey,
  WatchRule,
} from '#src/github-feed/contracts/watched-checks.ts';
import type { WatchedChecksRepository } from '#src/github-feed/repositories/watched-checks/watched-checks-repository.ts';

/** Each person's watch rules and repository exceptions in memory. */
export class InMemoryWatchedChecks implements WatchedChecksRepository {
  private readonly rules = new Map<string, WatchRule[]>();
  private readonly overrides = new Map<string, WatchOverride[]>();

  async rulesFor(props: { userId: string }): Promise<WatchRule[]> {
    return [...(this.rules.get(props.userId) ?? [])];
  }

  async overridesFor(props: { userId: string }): Promise<WatchOverride[]> {
    return (this.overrides.get(props.userId) ?? []).toSorted(
      (left, right) =>
        left.repository.localeCompare(right.repository) ||
        left.checkName.localeCompare(right.checkName),
    );
  }

  async addRule(props: {
    userId: string;
    pattern: string;
  }): Promise<WatchRule> {
    const owned = this.rules.get(props.userId) ?? [];
    const existing = owned.find(({ pattern }) => pattern === props.pattern);
    if (existing !== undefined) {
      return existing;
    }
    const rule = { id: randomUUID(), pattern: props.pattern };
    this.rules.set(props.userId, [...owned, rule]);
    return rule;
  }

  async removeRule(props: { userId: string; id: string }): Promise<boolean> {
    const owned = this.rules.get(props.userId) ?? [];
    this.rules.set(
      props.userId,
      owned.filter(({ id }) => id !== props.id),
    );
    return owned.some(({ id }) => id === props.id);
  }

  async setOverride(
    props: WatchOverrideKey & { userId: string; mode: WatchMode },
  ): Promise<void> {
    await this.clearOverride(props);
    const { userId, ...override } = props;
    this.overrides.set(userId, [
      ...(this.overrides.get(userId) ?? []),
      override,
    ]);
  }

  async clearOverride(
    props: WatchOverrideKey & { userId: string },
  ): Promise<void> {
    this.overrides.set(
      props.userId,
      (this.overrides.get(props.userId) ?? []).filter(
        (override) =>
          override.repository !== props.repository ||
          override.checkName !== props.checkName,
      ),
    );
  }
}

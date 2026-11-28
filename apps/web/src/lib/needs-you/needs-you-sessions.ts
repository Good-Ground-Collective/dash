import type { NeedsYouItem } from '#lib/needs-you/needs-you-contracts.ts';
import type { NeedsYouSession } from '#lib/needs-you/needs-you-session-contracts.ts';

/** The sessions Needs you items came from, so a row can say where its agent is running. */
export class NeedsYouSessions {
  readonly list: readonly NeedsYouSession[];

  private constructor(list: readonly NeedsYouSession[]) {
    this.list = list;
  }

  /** Whether any of `items` came from a session this list doesn't know. */
  missingFor(items: readonly NeedsYouItem[]): boolean {
    return items.some((item) => this.find(item) === undefined);
  }

  /** “claude-code on studio-mini”: the harness and the machine, else the bench, else the name it reports as. `null` when the session isn't known. */
  where(item: NeedsYouItem): string | null {
    const session = this.find(item);
    if (session === undefined) return null;
    const place =
      session.parent?.machine ?? session.benchId ?? session.reporterName;
    return `${session.harness} on ${place}`;
  }

  private find(item: NeedsYouItem): NeedsYouSession | undefined {
    return this.list.find(
      (session) =>
        session.sessionId === item.sessionId &&
        session.reportedBy === item.reportedBy,
    );
  }

  static of(list: readonly NeedsYouSession[]): NeedsYouSessions {
    return new NeedsYouSessions(list);
  }
}

import type { AgentHeartbeatQuestion } from '#src/agents/contracts/agent-heartbeat.ts';
import type { NeedsYouItem } from '#src/agents/contracts/needs-you-item.ts';
import type { NeedsYouKind } from '#src/agents/definitions/needs-you-kind/needs-you-kind.ts';
import type { NeedsYouItemRepository } from '#src/agents/repositories/needs-you-items/needs-you-item-repository.ts';

/** Needs you items in memory, holding at most one open item per session or subagent as the Drizzle repository does. */
export class InMemoryNeedsYouItems implements NeedsYouItemRepository {
  readonly items: NeedsYouItem[] = [];

  async open(props: {
    reportedBy: string;
    sessionId: string;
    agentId: string | null;
    question: AgentHeartbeatQuestion | null;
    kind: NeedsYouKind;
  }): Promise<NeedsYouItem | null> {
    const alreadyOpen = this.items.some(
      (item) =>
        item.resolvedAt === null &&
        item.reportedBy === props.reportedBy &&
        item.sessionId === props.sessionId &&
        item.agentId === props.agentId,
    );
    if (alreadyOpen) {
      return null;
    }

    const item: NeedsYouItem = {
      id: crypto.randomUUID(),
      reportedBy: props.reportedBy,
      sessionId: props.sessionId,
      agentId: props.agentId,
      question: props.question,
      kind: props.kind,
      openedAt: new Date().toISOString(),
      resolvedAt: null,
    };
    this.items.push(item);
    return item;
  }

  async resolveOne(props: {
    reportedBy: string;
    sessionId: string;
    agentId: string | null;
  }): Promise<NeedsYouItem[]> {
    return this.resolveWhere(
      (item) =>
        item.reportedBy === props.reportedBy &&
        item.sessionId === props.sessionId &&
        item.agentId === props.agentId,
    );
  }

  async resolveSession(props: {
    reportedBy: string;
    sessionId: string;
  }): Promise<NeedsYouItem[]> {
    return this.resolveWhere(
      (item) =>
        item.reportedBy === props.reportedBy &&
        item.sessionId === props.sessionId,
    );
  }

  async resolveStopped(props: {
    reportedBy: string;
    sessionId: string;
  }): Promise<NeedsYouItem[]> {
    return this.resolveWhere(
      (item) =>
        item.reportedBy === props.reportedBy &&
        item.sessionId === props.sessionId &&
        item.kind === 'stopped_responding',
    );
  }

  async listOpen(): Promise<NeedsYouItem[]> {
    return this.items
      .filter((item) => item.resolvedAt === null)
      .toSorted((a, b) => b.openedAt.localeCompare(a.openedAt));
  }

  private resolveWhere(
    matches: (item: NeedsYouItem) => boolean,
  ): NeedsYouItem[] {
    const resolved: NeedsYouItem[] = [];
    for (const [index, item] of this.items.entries()) {
      if (item.resolvedAt === null && matches(item)) {
        const closed = { ...item, resolvedAt: new Date().toISOString() };
        this.items[index] = closed;
        resolved.push(closed);
      }
    }
    return resolved;
  }
}

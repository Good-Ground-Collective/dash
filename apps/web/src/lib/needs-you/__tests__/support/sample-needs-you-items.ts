import type { NeedsYouItem } from '#lib/needs-you/needs-you-contracts.ts';

/** An open item that asks a question, opened at `openedAt`. */
export class SampleNeedsYouItems {
  static open(props: {
    id: string;
    openedAt: string;
    text?: string;
  }): NeedsYouItem {
    return {
      id: props.id,
      reportedBy: '2f0f6d1e-0000-4c1a-9a51-2f1f6a3c0099',
      sessionId: 'session-1234567890',
      agentId: 'hooks-builder',
      kind: 'needs_input',
      question: { text: props.text ?? 'Which outbox path?' },
      openedAt: new Date(props.openedAt),
      resolvedAt: null,
    };
  }

  /** An open item for a session that stopped responding. */
  static stopped(props: { id: string; openedAt: string }): NeedsYouItem {
    return {
      ...SampleNeedsYouItems.open(props),
      kind: 'stopped_responding',
      agentId: null,
      question: null,
    };
  }

  static resolved(item: NeedsYouItem): NeedsYouItem {
    return { ...item, resolvedAt: new Date('2026-11-27T12:30:00.000Z') };
  }
}

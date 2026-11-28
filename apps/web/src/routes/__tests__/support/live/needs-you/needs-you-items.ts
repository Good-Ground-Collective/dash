const reportedBy = '2f0f6d1e-0000-4c1a-9a51-2f1f6a3c0099';

export interface StubNeedsYouItem {
  id: string;
  reportedBy: string;
  sessionId: string;
  agentId: string | null;
  kind: 'needs_input' | 'stopped_responding';
  question: {
    text: string;
    options?: { label: string; description?: string }[];
  } | null;
  openedAt: string;
  resolvedAt: string | null;
}

export interface StubSession {
  reportedBy: string;
  sessionId: string;
  reporterName: string;
  benchId: string | null;
  harness: string;
  machine: string | null;
}

/** The items the Needs you stub can hold, by the name tests open them with. */
export class NeedsYouItems {
  static readonly NAMES = [
    'outbox',
    'options',
    'markup',
    'silent',
    'review',
  ] as const;

  /** The session an item came from, for the items that have one. The rest show without where their agent runs. */
  static sessionOf(item: StubNeedsYouItem): StubSession | null {
    const base = { reportedBy: item.reportedBy, sessionId: item.sessionId };
    if (item.sessionId === 'session-outbox-1') {
      return {
        ...base,
        reporterName: 'studio-hooks',
        benchId: 'studio-mini',
        harness: 'claude-code',
        machine: 'studio-mini',
      };
    }
    if (item.sessionId === 'session-options-2') {
      return {
        ...base,
        reporterName: 'cloud-1',
        benchId: 'cloud-1',
        harness: 'codex',
        machine: null,
      };
    }
    return null;
  }

  static named(name: string, props: { minutesAgo: number }): StubNeedsYouItem {
    const base = {
      reportedBy,
      kind: 'needs_input' as const,
      openedAt: NeedsYouItems.minutesAgo(props.minutesAgo),
      resolvedAt: null,
    };
    switch (name) {
      case 'outbox':
        return {
          ...base,
          id: 'b0000000-0000-4000-8000-000000000001',
          sessionId: 'session-outbox-1',
          agentId: 'hooks-builder',
          question: { text: 'Which outbox path should be the default?' },
        };
      case 'options':
        return {
          ...base,
          id: 'b0000000-0000-4000-8000-000000000002',
          sessionId: 'session-options-2',
          agentId: 'release-bot',
          question: {
            text: 'Ship the standards package as 1.1.0 or 2.0.0?',
            options: [
              { label: '1.1.0', description: 'Additive only' },
              { label: '2.0.0' },
            ],
          },
        };
      case 'markup':
        return {
          ...base,
          id: 'b0000000-0000-4000-8000-000000000003',
          sessionId: 'session-markup-3',
          agentId: null,
          question: { text: '<img src=x onerror=alert(1)> Run the migration?' },
        };
      case 'silent':
        return {
          ...base,
          id: 'b0000000-0000-4000-8000-000000000004',
          sessionId: 'session-silent-4',
          agentId: 'nightly-triage',
          question: null,
        };
      case 'review':
        return {
          ...base,
          id: 'b0000000-0000-4000-8000-000000000005',
          sessionId: 'session-review-5',
          agentId: 'review-bot',
          question: { text: 'Should the relay start before #141 merges?' },
        };
      default:
        throw new Error(`No Needs you item is named ${name}`);
    }
  }

  private static minutesAgo(minutes: number): string {
    return new Date(Date.now() - minutes * 60_000).toISOString();
  }
}

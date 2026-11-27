import { describe, expect, it } from 'vitest';
import type { Objectives } from '#lib/api/objectives-contracts.ts';
import { ObjectivesView } from '#lib/objectives/objectives-view.ts';
import { SampleObjectives } from './support/sample-objectives.ts';

class View {
  static of(props: {
    objectives: Objectives;
    githubConnected?: boolean;
    anyInitiative?: boolean;
  }): ObjectivesView {
    return new ObjectivesView({
      state: {
        status: 'loaded',
        objectives: props.objectives,
        githubConnected: props.githubConnected ?? true,
        anyInitiative:
          props.anyInitiative ?? props.objectives.initiatives.length > 0,
      },
    });
  }
}

describe('ObjectivesView.status', () => {
  it('is ready with initiatives, keeping Mission Control’s order', () => {
    const view = View.of({
      objectives: SampleObjectives.objectives({
        initiatives: [
          SampleObjectives.initiative({ id: 'B', title: 'B' }),
          SampleObjectives.initiative({ id: 'A', title: 'A' }),
        ],
      }),
    });

    expect(view.status).toBe('ready');
    expect(view.initiatives.map(({ row }) => row.id)).toEqual(['B', 'A']);
    expect(view.initiatives[0]?.epics[0]?.row.id).toBe('E_1');
  });

  it('is not connected with no connection anywhere', () => {
    const view = View.of({
      objectives: { connections: [], initiatives: [] },
      githubConnected: false,
    });

    expect(view.status).toBe('not-connected');
  });

  it('is on its first sync while GitHub is connected but not yet read', () => {
    expect(
      View.of({ objectives: { connections: [], initiatives: [] } }).status,
    ).toBe('first-sync');
    expect(
      View.of({
        objectives: {
          connections: [SampleObjectives.connection({ lastSyncedAt: null })],
          initiatives: [],
        },
      }).status,
    ).toBe('first-sync');
  });
});

describe('ObjectivesView.status without initiatives', () => {
  it('is empty once a read finished or failed and found nothing', () => {
    const view = View.of({
      objectives: {
        connections: [
          SampleObjectives.connection({
            lastSyncedAt: null,
            lastError: 'Dash reads initiatives from an organisation’s tracker.',
          }),
        ],
        initiatives: [],
      },
    });

    expect(view.status).toBe('empty');
  });

  it('is filtered out when initiatives exist but none match', () => {
    const view = View.of({
      objectives: SampleObjectives.objectives({ initiatives: [] }),
      anyInitiative: true,
    });

    expect(view.status).toBe('filtered-out');
  });

  it('is failed when Mission Control didn’t answer', () => {
    const view = new ObjectivesView({ state: { status: 'failed' } });

    expect(view.status).toBe('failed');
    expect(view.initiatives).toEqual([]);
    expect(view.notices).toEqual([]);
  });
});

describe('ObjectivesView.notices', () => {
  it('names each connection whose last read failed or was cut short', () => {
    const view = View.of({
      objectives: SampleObjectives.objectives({
        connections: [
          SampleObjectives.connection(),
          SampleObjectives.connection({
            id: 'c-night',
            accountLogin: 'night-shift',
            lastError: 'GitHub rate-limited the read.',
          }),
          SampleObjectives.connection({
            id: 'c-big',
            accountLogin: 'big-co',
            truncated: true,
          }),
        ],
      }),
    });

    expect(view.notices).toEqual([
      {
        id: 'c-night',
        login: 'night-shift',
        message: 'GitHub rate-limited the read.',
      },
      {
        id: 'c-big',
        login: 'big-co',
        message:
          'This account has more Projects or epics than Dash reads, so only the most recent show.',
      },
    ]);
  });
});

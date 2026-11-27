import { describe, expect, it } from 'vitest';
import { OverlayActions } from '#lib/objectives/overlay-actions.ts';
import { SampleObjectives } from './support/sample-objectives.ts';

class Form {
  static of(fields: Record<string, string>): FormData {
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.set(name, value);
    return form;
  }
}

describe('OverlayActions.for', () => {
  it('offers parking but nothing the tracker sets', () => {
    expect(OverlayActions.for(SampleObjectives.epic())).toEqual({
      park: true,
      unpark: false,
      manualProgress: null,
      priority: null,
      dueDate: null,
    });
  });

  it('offers Dash’s own values, with what Dash holds now, when the tracker has none', () => {
    const actions = OverlayActions.for(
      SampleObjectives.epic({
        status: 'parked',
        priority: { value: 'P2', source: 'dash' },
        dueDate: null,
        progress: { source: 'manual', percent: 30 },
      }),
    );

    expect(actions).toEqual({
      park: false,
      unpark: true,
      manualProgress: { current: 30 },
      priority: { current: 'P2' },
      dueDate: { current: null },
    });
  });

  it('offers manual progress when nothing is linked yet', () => {
    const actions = OverlayActions.for(
      SampleObjectives.initiative({ progress: { source: 'none' } }),
    );

    expect(actions.manualProgress).toEqual({ current: null });
  });

  it('neither parks nor unparks what the tracker closed', () => {
    const actions = OverlayActions.for(
      SampleObjectives.epic({ status: 'done' }),
    );

    expect(actions.park).toBe(false);
    expect(actions.unpark).toBe(false);
  });
});

describe('OverlayActions.parseForm', () => {
  it('reads parking as a boolean', () => {
    expect(
      OverlayActions.parseForm(
        Form.of({ id: 'E_1', field: 'parked', value: 'true' }),
      ),
    ).toEqual({ id: 'E_1', changes: { parked: true } });
  });

  it('reads a set value and a blank one as null, which clears it', () => {
    expect(
      OverlayActions.parseForm(
        Form.of({ id: 'E_1', field: 'manualProgress', value: '45' }),
      ),
    ).toEqual({ id: 'E_1', changes: { manualProgress: 45 } });
    expect(
      OverlayActions.parseForm(
        Form.of({ id: 'E_1', field: 'dueDate', value: ' ' }),
      ),
    ).toEqual({ id: 'E_1', changes: { dueDate: null } });
    expect(
      OverlayActions.parseForm(
        Form.of({ id: 'E_1', field: 'priority', value: 'P3' }),
      ),
    ).toEqual({ id: 'E_1', changes: { priority: 'P3' } });
  });

  it('refuses unknown fields and values out of range', () => {
    for (const fields of [
      { id: 'E_1', field: 'title', value: 'x' },
      { id: 'E_1', field: 'manualProgress', value: '101' },
      { id: 'E_1', field: 'manualProgress', value: 'half' },
      { id: 'E_1', field: 'priority', value: 'P4' },
      { id: 'E_1', field: 'dueDate', value: '12/12/2026' },
      { id: '', field: 'parked', value: 'true' },
    ]) {
      expect(OverlayActions.parseForm(Form.of(fields))).toBeNull();
    }
  });
});

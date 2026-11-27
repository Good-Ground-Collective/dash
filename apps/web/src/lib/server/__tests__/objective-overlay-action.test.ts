import { isActionFailure } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MissionControlObjectiveOverlayAction,
  type OverlayActionEvent,
} from '#lib/server/objective-overlay-action.ts';

/** One form post, with Mission Control answering the PATCH. */
class OverlayPost {
  readonly sent: { url: string; method: string; body: unknown }[] = [];
  private readonly fields: Record<string, string>;
  private readonly answer: () => Response;

  constructor(props: {
    fields: Record<string, string>;
    answer: () => Response;
  }) {
    this.fields = props.fields;
    this.answer = props.answer;
  }

  get event(): OverlayActionEvent {
    const form = new FormData();
    for (const [name, value] of Object.entries(this.fields)) {
      form.set(name, value);
    }
    return {
      request: new Request('http://localhost/?/overlay', {
        method: 'POST',
        body: form,
      }),
      fetch: async (input, init) => {
        this.sent.push({
          url: String(input),
          method: init?.method ?? 'GET',
          body: JSON.parse(String(init?.body)),
        });
        return this.answer();
      },
    };
  }
}

const overlay = {
  id: 'E_1',
  parked: true,
  manualProgress: null,
  priority: null,
  dueDate: null,
};

const action = new MissionControlObjectiveOverlayAction({
  apiBaseUrl: 'https://api.example.test',
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MissionControlObjectiveOverlayAction', () => {
  it('sends the change to Mission Control and names the row', async () => {
    const post = new OverlayPost({
      fields: { id: 'E_1', field: 'parked', value: 'true' },
      answer: () => Response.json(overlay),
    });

    await expect(action.edit(post.event)).resolves.toEqual({
      overlay: { id: 'E_1', message: null },
    });
    expect(post.sent).toEqual([
      {
        url: 'https://api.example.test/objectives/E_1/overlay',
        method: 'PATCH',
        body: { parked: true },
      },
    ]);
  });

  it('sends null to clear a value', async () => {
    const post = new OverlayPost({
      fields: { id: 'E_1', field: 'priority', value: '' },
      answer: () => Response.json(overlay),
    });

    await action.edit(post.event);

    expect(post.sent[0]?.body).toEqual({ priority: null });
  });
});

describe('MissionControlObjectiveOverlayAction refusals', () => {
  it('explains a field the tracker owns', async () => {
    const post = new OverlayPost({
      fields: { id: 'E_1', field: 'priority', value: 'P1' },
      answer: () =>
        Response.json(
          { code: 'TRACKER_OWNS_FIELD', message: 'The tracker sets priority' },
          { status: 409 },
        ),
    });

    const result = await action.edit(post.event);

    expect(isActionFailure(result)).toBe(true);
    expect(result).toMatchObject({
      status: 409,
      data: {
        overlay: {
          id: 'E_1',
          message:
            'GitHub already sets this, so change it there. Reload to see its value.',
        },
      },
    });
  });

  it('refuses a form that isn’t a change, without calling Mission Control', async () => {
    const post = new OverlayPost({
      fields: { id: 'E_1', field: 'title', value: 'Renamed' },
      answer: () => Response.json(overlay),
    });

    const result = await action.edit(post.event);

    expect(result).toMatchObject({ status: 400 });
    expect(post.sent).toEqual([]);
  });

  it('asks to try again when Mission Control fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const post = new OverlayPost({
      fields: { id: 'E_1', field: 'manualProgress', value: '20' },
      answer: () => new Response('down', { status: 503 }),
    });

    await expect(action.edit(post.event)).resolves.toMatchObject({
      status: 503,
      data: {
        overlay: {
          id: 'E_1',
          message: 'Mission Control didn’t save that. Try again.',
        },
      },
    });
  });
});

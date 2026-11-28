import { describe, expect, it } from 'vitest';
import { NeedsYouWording } from '#lib/needs-you/needs-you-wording.ts';
import { SampleNeedsYouItems } from '#lib/needs-you/__tests__/support/sample-needs-you-items.ts';

const asked = SampleNeedsYouItems.open({
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  openedAt: '2026-11-27T12:00:00.000Z',
});

describe('NeedsYouWording', () => {
  it('labels a question as Question and shows its text', () => {
    expect(NeedsYouWording.pill(asked)).toBe('Question');
    expect(NeedsYouWording.headline(asked)).toBe('Which outbox path?');
  });

  it('labels a needs-input item with no question as Needs input', () => {
    const silent = { ...asked, question: null };

    expect(NeedsYouWording.pill(silent)).toBe('Needs input');
    expect(NeedsYouWording.headline(silent)).toBe(
      'An agent is waiting for you',
    );
  });

  it('labels a stopped_responding item Stopped responding with its own text', () => {
    const stopped = SampleNeedsYouItems.stopped({
      id: 'aaaaaaaa-0000-4000-8000-000000000003',
      openedAt: '2026-11-27T12:05:00.000Z',
    });

    expect(NeedsYouWording.pill(stopped)).toBe('Stopped responding');
    expect(NeedsYouWording.headline(stopped)).toBe(
      'An agent stopped responding',
    );
  });
});

import { describe, expect, it } from 'vitest';
import { OpenNeedsYouItems } from '#lib/needs-you/open-needs-you-items.ts';
import { SampleNeedsYouItems } from '#lib/needs-you/__tests__/support/sample-needs-you-items.ts';

const older = SampleNeedsYouItems.open({
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  openedAt: '2026-11-27T12:00:00.000Z',
});
const newer = SampleNeedsYouItems.open({
  id: 'aaaaaaaa-0000-4000-8000-000000000002',
  openedAt: '2026-11-27T12:10:00.000Z',
});

describe('OpenNeedsYouItems', () => {
  it('lists the newest first and counts them', () => {
    const open = OpenNeedsYouItems.of([older, newer]);

    expect(open.items).toEqual([newer, older]);
    expect(open.count).toBe(2);
  });

  it('adds an opened item in order and does not double one it already has', () => {
    const open = OpenNeedsYouItems.of([older]).opened(newer).opened(newer);

    expect(open.items).toEqual([newer, older]);
  });

  it('removes a resolved item and ignores one it never had', () => {
    const open = OpenNeedsYouItems.of([older, newer]);

    expect(open.resolved(SampleNeedsYouItems.resolved(older)).items).toEqual([
      newer,
    ]);
    expect(
      OpenNeedsYouItems.of([newer]).resolved(
        SampleNeedsYouItems.resolved(older),
      ).items,
    ).toEqual([newer]);
  });

  it('leaves out items that are already resolved', () => {
    expect(
      OpenNeedsYouItems.of([SampleNeedsYouItems.resolved(older), newer]).items,
    ).toEqual([newer]);
  });

  it('returns a new list without changing the old one', () => {
    const before = OpenNeedsYouItems.of([older]);

    before.opened(newer);

    expect(before.count).toBe(1);
  });
});

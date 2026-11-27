import { describe, expect, it } from 'vitest';
import { ObjectiveFilter } from '#lib/objectives/objective-filter.ts';

class Filter {
  static at(href: string): ObjectiveFilter {
    return new ObjectiveFilter({ url: new URL(href, 'http://localhost') });
  }
}

describe('ObjectiveFilter', () => {
  it('shows only active objectives by default', () => {
    const filter = Filter.at('/');

    expect(filter.statuses).toEqual(['active']);
    expect(filter.showsEverything).toBe(false);
    expect(filter.options).toEqual([
      {
        status: 'parked',
        label: 'Show parked',
        href: '/?show=parked',
        shown: false,
      },
      { status: 'done', label: 'Show done', href: '/?show=done', shown: false },
    ]);
  });

  it('adds the statuses `show` names, ignoring unknown ones', () => {
    const filter = Filter.at('/?show=done,parked,bogus');

    expect(filter.statuses).toEqual(['active', 'parked', 'done']);
    expect(filter.showsEverything).toBe(true);
  });

  it('toggles one status while keeping the other and the rest of the query', () => {
    const filter = Filter.at('/?account=acme&show=parked');

    expect(filter.options).toEqual([
      expect.objectContaining({
        status: 'parked',
        shown: true,
        href: '/?account=acme',
      }),
      expect.objectContaining({
        status: 'done',
        shown: false,
        href: '/?account=acme&show=parked%2Cdone',
      }),
    ]);
  });
});

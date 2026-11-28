import { GithubFeedItems } from './github-feed-items.ts';

interface EpicWork {
  area: string;
  issues: number[];
  merges: number;
}

const epicWork: EpicWork[] = [
  { area: 'sign-in', issues: [100, 101, 102], merges: 11 },
  { area: 'billing', issues: [110, 111, 112, 113], merges: 8 },
  { area: 'status page', issues: [120, 121, 122], merges: 6 },
  { area: 'guides', issues: [130, 131, 132], merges: 5 },
  { area: 'private beta', issues: [160, 161, 162, 163], merges: 4 },
  { area: 'API reference', issues: [140, 141], merges: 3 },
  { area: 'changelog', issues: [150, 151, 152], merges: 2 },
];

const verbs = ['Tighten', 'Cover', 'Rename', 'Split', 'Trim', 'Document'];

/** A day with 45 merges across the stub tracker's epics, a closed initiative, six unlinked merges and five releases, for the busy-day Since yesterday. */
export class GithubFeedBusyDay {
  static merges() {
    const linked = epicWork.flatMap(({ area, issues, merges }) =>
      Array.from({ length: merges }, (_, index) => ({
        title: `${verbs[index % verbs.length] ?? 'Tighten'} ${area} ${String(index + 1)}`,
        closes: [issues[index % issues.length] ?? 0],
      })),
    );
    const loose = [
      { title: 'Bump the lockfile', closes: [] },
      { title: 'Fix a typo in the README', closes: [] },
      { title: 'Pin the runner image', closes: [] },
      { title: 'Silence a flaky timer test', closes: [] },
      { title: 'Update the issue template', closes: [] },
      { title: 'Close a duplicate report', closes: [4821] },
    ];

    const merged = [...linked, ...loose].map((work, index) =>
      GithubFeedItems.pull({
        repo: 'acme-labs/api',
        number: 500 + index,
        title: work.title,
        minutes: 25 + index * 29,
        review: 'approved',
        state: 'merged',
        closes: work.closes,
      }),
    );
    const tooOld = GithubFeedItems.pull({
      repo: 'acme-labs/api',
      number: 499,
      title: 'Merged a day and a half ago',
      minutes: 60 * 36,
      state: 'merged',
      closes: [100],
    });
    return [...merged, tooOld];
  }

  static releases() {
    const release = GithubFeedItems.release;
    return [
      release({
        repo: 'acme-labs/api',
        tag: 'v2.6.1',
        name: 'API 2.6.1',
        minutes: 50,
      }),
      release({
        repo: 'acme-labs/api',
        tag: 'v2.6.0',
        name: 'API 2.6.0',
        minutes: 400,
      }),
      release({
        repo: 'acme-labs/web',
        tag: 'v1.11.0',
        name: 'Web 1.11.0',
        minutes: 700,
      }),
      release({
        repo: 'acme-labs/web',
        tag: 'v1.10.2',
        name: 'Web 1.10.2',
        minutes: 1200,
      }),
      release({
        repo: 'acme-labs/web',
        tag: 'v1.10.1',
        name: 'Web 1.10.1',
        minutes: 60 * 40,
      }),
    ];
  }
}

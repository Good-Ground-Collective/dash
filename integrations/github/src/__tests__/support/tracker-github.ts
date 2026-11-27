import type { GithubJson } from '#src/__tests__/support/fake-github.ts';
import { FakeGithubGraphql } from '#src/__tests__/support/fake-github-graphql.ts';
import { TrackerNodes } from '#src/__tests__/support/tracker-nodes.ts';

const { project, projects, epicItem, epics, ticket } = TrackerNodes;

/** Fake GitHubs for the task tracker: organisations with Projects, epics and sub-issues. */
export class TrackerGithub {
  /** One open Project, `PVT_1`, holding `items`. */
  static withEpics(items: GithubJson[]): FakeGithubGraphql {
    return new FakeGithubGraphql()
      .on({
        operation: 'DashProjects',
        reply: () => projects({ nodes: [project({ number: 1 })] }),
      })
      .on({
        operation: 'DashProjectEpics',
        reply: () => epics({ nodes: items }),
      });
  }

  /** One Project whose epics come one a page, for as many pages as GitHub is asked for. */
  static endlessEpics(): FakeGithubGraphql {
    return new FakeGithubGraphql()
      .on({
        operation: 'DashProjects',
        reply: () => projects({ nodes: [project({ number: 1 })] }),
      })
      .on({
        operation: 'DashProjectEpics',
        reply: ({ variables }) => {
          const page = Number(variables['after'] ?? 0) + 1;
          return epics({
            nodes: [epicItem({ number: page })],
            endCursor: String(page),
          });
        },
      });
  }

  /**
   * Acme's open Project 1 (target date 2026-12-31) and closed Project 2. Project 1 holds epic
   * 10 (Priority `P2 - Soon`, Target date 2026-12-15, two tickets), epic 20 (only a `p3`
   * label), an issue labelled `bug`, an issue the App can't see and a draft. Project 2 holds
   * epic 20 again, with Priority P1.
   */
  static organisation(): FakeGithubGraphql {
    return new FakeGithubGraphql()
      .on({
        operation: 'DashProjects',
        reply: () =>
          projects({
            nodes: [
              project({ number: 1, targetDate: '2026-12-31' }),
              project({ number: 2, closed: true }),
            ],
          }),
      })
      .on({
        operation: 'DashProjectEpics',
        reply: ({ variables }) =>
          epics({
            nodes:
              variables['projectId'] === 'PVT_1'
                ? TrackerGithub.firstProjectItems()
                : [epicItem({ number: 20, priority: 'P1' })],
          }),
      });
  }

  private static firstProjectItems(): GithubJson[] {
    return [
      epicItem({
        number: 10,
        priority: 'P2 - Soon',
        targetDate: '2026-12-15',
        labels: ['epic', 'P1'],
        tickets: [
          ticket({ number: 12, labels: ['P1'] }),
          ticket({ number: 11, state: 'CLOSED' }),
        ],
      }),
      epicItem({ number: 20, labels: ['Epic', 'p3'] }),
      epicItem({ number: 30, labels: ['bug'] }),
      { priority: null, targetDate: null, content: null },
      {
        priority: null,
        targetDate: null,
        content: { __typename: 'DraftIssue' },
      },
    ];
  }
}

import type { Priority } from '@dash/integrations-core';
import { z } from 'zod';

const priorityPattern = /^\s*P(?<rank>[123])\b/iu;
const priorities: readonly Priority[] = ['P1', 'P2', 'P3'];

const timestampSchema = z.iso.datetime({ offset: true });

/** `P1`, `P2` or `P3` from the start of a name, such as a `P1` label or a `P2 - Soon` option. */
const priorityNameSchema = z.string().transform((name): Priority | null => {
  const rank = priorityPattern.exec(name)?.groups?.['rank'];
  return rank === undefined ? null : (priorities[Number(rank) - 1] ?? null);
});

const labelsSchema = z
  .object({ nodes: z.array(z.object({ name: z.string() })) })
  .transform(({ nodes }) => {
    const names = nodes.map(({ name }) => name);
    const ranked = names
      .map((name) => priorityNameSchema.parse(name))
      .filter((priority) => priority !== null)
      .toSorted();
    return {
      epic: names.some((name) => name.toLowerCase() === 'epic'),
      priority: ranked[0] ?? null,
    };
  });

const issueStateSchema = z
  .enum(['OPEN', 'CLOSED'])
  .transform((state) => state.toLowerCase())
  .pipe(z.enum(['open', 'closed']));

const actorSchema = z
  .object({ login: z.string().min(1) })
  .nullable()
  .transform((author) => author?.login ?? null);

const issueSchema = z.object({
  id: z.string().min(1),
  number: z.int().positive(),
  title: z.string().min(1),
  url: z.url(),
  state: issueStateSchema,
  closedAt: timestampSchema.nullable(),
  updatedAt: timestampSchema,
  labels: labelsSchema
    .nullable()
    .transform((labels) => labels ?? { epic: false, priority: null }),
});

export const githubTicketNodeSchema = issueSchema.extend({
  comments: z.object({
    nodes: z.array(
      z.object({
        url: z.url(),
        createdAt: timestampSchema,
        author: actorSchema,
      }),
    ),
  }),
  closedByPullRequestsReferences: z
    .object({
      nodes: z.array(
        z.object({
          url: z.url(),
          mergedAt: timestampSchema.nullable(),
          author: actorSchema,
        }),
      ),
    })
    .nullable(),
});

const epicContentSchema = z
  .discriminatedUnion('__typename', [
    issueSchema.extend({
      __typename: z.literal('Issue'),
      subIssues: z.object({
        totalCount: z.int().nonnegative(),
        nodes: z.array(githubTicketNodeSchema),
      }),
    }),
    z.object({ __typename: z.enum(['DraftIssue', 'PullRequest']) }),
  ])
  .transform((content) => {
    if (content.__typename !== 'Issue') {
      return null;
    }
    const { __typename: typename, ...issue } = content;
    return issue;
  });

export const githubEpicItemSchema = z.object({
  priority: z
    .object({ name: z.string().nullish() })
    .nullable()
    .transform((value) =>
      value?.name === undefined || value.name === null
        ? null
        : priorityNameSchema.parse(value.name),
    ),
  targetDate: z
    .object({ date: z.iso.date().nullish() })
    .nullable()
    .transform((value) => value?.date ?? null),
  content: epicContentSchema
    .nullable()
    .describe(
      'Null for a draft or pull request, or when the App can’t see the repository the issue is in.',
    ),
});

export const githubProjectsDataSchema = z.object({
  organization: z
    .object({
      projectsV2: z.object({
        pageInfo: z.object({ hasNextPage: z.boolean() }),
        nodes: z.array(
          z
            .object({
              id: z.string().min(1),
              number: z.int().positive(),
              title: z.string().min(1),
              url: z.url(),
              closed: z.boolean(),
              updatedAt: timestampSchema,
              statusUpdates: z.object({
                nodes: z.array(
                  z.object({ targetDate: z.iso.date().nullable() }),
                ),
              }),
            })
            .transform(({ statusUpdates, ...project }) => ({
              ...project,
              targetDate: statusUpdates.nodes[0]?.targetDate ?? null,
            })),
        ),
      }),
    })
    .nullable(),
});

export const githubEpicsDataSchema = z.object({
  node: z
    .object({
      items: z.object({
        pageInfo: z.object({
          hasNextPage: z.boolean(),
          endCursor: z.string().nullable(),
        }),
        nodes: z.array(githubEpicItemSchema),
      }),
    })
    .nullable(),
});

export type GithubTicketNode = z.infer<typeof githubTicketNodeSchema>;
export type GithubEpicItem = z.infer<typeof githubEpicItemSchema>;
export type GithubEpicIssue = NonNullable<GithubEpicItem['content']>;
export type GithubProject = NonNullable<
  z.infer<typeof githubProjectsDataSchema>['organization']
>['projectsV2']['nodes'][number];

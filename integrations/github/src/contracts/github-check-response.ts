import { type ActivityCheckState, webUrlSchema } from '@dash/integrations-core';
import { z } from 'zod';

const checkRunFailures = new Set([
  'FAILURE',
  'TIMED_OUT',
  'CANCELLED',
  'ACTION_REQUIRED',
  'STARTUP_FAILURE',
  'ERROR',
]);

const statusFailures = new Set(['FAILURE', 'ERROR']);

const detailsUrlSchema = z
  .string()
  .nullable()
  .transform((url) =>
    url !== null && webUrlSchema.safeParse(url).success ? url : null,
  );

/** What one node of a head commit's `statusCheckRollup.contexts` says, as the provider-neutral check fields. */
export interface GithubCheckContext {
  name: string;
  kind: 'check_run' | 'status';
  app: string | null;
  state: ActivityCheckState;
  url: string | null;
  workflowRunId: number | null;
  jobId: number | null;
}

class CheckStates {
  static ofCheckRun(props: {
    status: string;
    conclusion: string | null;
  }): ActivityCheckState {
    const { status, conclusion } = props;
    if (status !== 'COMPLETED' || conclusion === null) {
      return 'pending';
    }
    if (conclusion === 'SUCCESS') {
      return 'success';
    }
    if (conclusion === 'SKIPPED') {
      return 'skipped';
    }
    return checkRunFailures.has(conclusion) ? 'failure' : 'neutral';
  }

  static ofStatus(state: string): ActivityCheckState {
    if (state === 'SUCCESS') {
      return 'success';
    }
    return statusFailures.has(state) ? 'failure' : 'pending';
  }
}

const checkRunContextSchema = z
  .object({
    __typename: z.literal('CheckRun'),
    name: z.string().min(1),
    status: z.string(),
    conclusion: z.string().nullable(),
    detailsUrl: detailsUrlSchema,
    completedAt: z.iso.datetime({ offset: true }).nullable(),
    databaseId: z.int().nullable(),
    checkSuite: z
      .object({
        app: z.object({ slug: z.string().min(1) }).nullable(),
        workflowRun: z.object({ databaseId: z.int().nullable() }).nullable(),
      })
      .nullable(),
  })
  .transform((node): GithubCheckContext => {
    const workflowRunId = node.checkSuite?.workflowRun?.databaseId ?? null;
    return {
      name: node.name,
      kind: 'check_run',
      app: node.checkSuite?.app?.slug ?? null,
      state: CheckStates.ofCheckRun(node),
      url: node.detailsUrl,
      workflowRunId,
      jobId: workflowRunId === null ? null : node.databaseId,
    };
  });

const statusContextSchema = z
  .object({
    __typename: z.literal('StatusContext'),
    context: z.string().min(1),
    state: z.string(),
    targetUrl: detailsUrlSchema,
    description: z.string().nullable(),
  })
  .transform((node): GithubCheckContext => ({
    name: node.context,
    kind: 'status',
    app: null,
    state: CheckStates.ofStatus(node.state),
    url: node.targetUrl,
    workflowRunId: null,
    jobId: null,
  }));

export const githubCheckContextSchema = z.discriminatedUnion('__typename', [
  checkRunContextSchema,
  statusContextSchema,
]);

export const githubCheckContextNodesSchema = z
  .array(githubCheckContextSchema.nullable())
  .nullish()
  .transform((nodes): GithubCheckContext[] =>
    (nodes ?? []).filter((node) => node !== null),
  );

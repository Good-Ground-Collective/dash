import { z } from 'zod';

import { externalRecordSchema } from '#src/contracts/external-record.ts';

const handleSchema = z
  .string()
  .min(1)
  .describe('The account handle as the provider shows it.');

export const repositorySchema = externalRecordSchema.extend({
  fullName: z.string().min(1).describe('Owner and name, such as `acme/app`.'),
  defaultBranch: z.string().min(1),
  archived: z.boolean(),
});

export const pullRequestSchema = externalRecordSchema.extend({
  repositoryId: z.string().min(1),
  number: z.int().positive(),
  title: z.string(),
  author: handleSchema,
  state: z.enum(['open', 'closed', 'merged']),
  draft: z.boolean(),
  mergeable: z.enum(['mergeable', 'conflicting', 'unknown']),
  reviewDecision: z
    .enum(['approved', 'changes_requested', 'review_required'])
    .nullable()
    .describe('Null when the repository requires no review.'),
  requestedReviewers: z.array(handleSchema),
  headSha: z.string().min(1),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const reviewSchema = externalRecordSchema.extend({
  pullRequestId: z.string().min(1),
  author: handleSchema,
  state: z.enum(['approved', 'changes_requested', 'commented', 'dismissed']),
  submittedAt: z.iso.datetime({ offset: true }),
});

export const checkStateSchema = z.enum(['pending', 'success', 'failure']);

export const checkRollupSchema = z.object({
  pullRequestId: z.string().min(1),
  headSha: z.string().min(1),
  state: checkStateSchema.describe(
    'Failure if any check failed, pending if any is still running, otherwise success.',
  ),
  checks: z.array(
    z.object({
      name: z.string().min(1),
      state: checkStateSchema,
      url: z.url().nullable(),
    }),
  ),
});

export const pullRequestQuerySchema = z.object({
  repositoryId: z.string().min(1).optional(),
  state: z.enum(['open', 'closed', 'all']).default('open'),
});

export type Repository = z.infer<typeof repositorySchema>;
export type PullRequest = z.infer<typeof pullRequestSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type CheckState = z.infer<typeof checkStateSchema>;
export type CheckRollup = z.infer<typeof checkRollupSchema>;
export type PullRequestQuery = z.input<typeof pullRequestQuerySchema>;

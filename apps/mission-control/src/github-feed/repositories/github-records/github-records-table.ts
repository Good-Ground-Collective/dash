import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { connectionTable } from '#src/connections/repositories/connections/connections-table.ts';

/** How the latest reads of a GitHub connection went, and whose work they read. */
export const githubSyncTable = pgTable('github_sync', {
  connectionId: uuid('connection_id')
    .primaryKey()
    .references(() => connectionTable.id, { onDelete: 'cascade' }),
  viewerLogin: text('viewer_login'),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  lastAttemptedAt: timestamp('last_attempted_at', {
    withTimezone: true,
  }).notNull(),
  lastError: text('last_error'),
});

export const githubRepoTable = pgTable(
  'github_repo',
  {
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => connectionTable.id, { onDelete: 'cascade' }),
    nodeId: text('node_id').notNull(),
    fullName: text('full_name').notNull(),
    url: text('url').notNull(),
    defaultBranch: text('default_branch'),
    archived: boolean('archived').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.connectionId, table.nodeId] })],
);

export const githubPullRequestTable = pgTable(
  'github_pull_request',
  {
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => connectionTable.id, { onDelete: 'cascade' }),
    nodeId: text('node_id').notNull(),
    repositoryNodeId: text('repository_node_id').notNull(),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    url: text('url').notNull(),
    state: text('state', { enum: ['open', 'closed', 'merged'] }).notNull(),
    draft: boolean('draft').notNull(),
    mergeable: text('mergeable', {
      enum: ['mergeable', 'conflicting', 'unknown'],
    }).notNull(),
    reviewDecision: text('review_decision', {
      enum: ['approved', 'changes_requested', 'review_required'],
    }),
    author: text('author'),
    headRef: text('head_ref').notNull(),
    headSha: text('head_sha').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.connectionId, table.nodeId] })],
);

export const githubReviewRequestTable = pgTable(
  'github_review_request',
  {
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => connectionTable.id, { onDelete: 'cascade' }),
    pullRequestNodeId: text('pull_request_node_id').notNull(),
    reviewerKind: text('reviewer_kind', { enum: ['user', 'team'] }).notNull(),
    reviewer: text('reviewer').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      name: 'github_review_request_pk',
      columns: [
        table.connectionId,
        table.pullRequestNodeId,
        table.reviewerKind,
        table.reviewer,
      ],
    }),
  ],
);

/** The checks and statuses on a pull request's head commit. */
export const githubCheckRollupTable = pgTable(
  'github_check_rollup',
  {
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => connectionTable.id, { onDelete: 'cascade' }),
    pullRequestNodeId: text('pull_request_node_id').notNull(),
    headSha: text('head_sha').notNull(),
    state: text('state', { enum: ['pending', 'success', 'failure'] }).notNull(),
    successCount: integer('success_count').notNull(),
    failureCount: integer('failure_count').notNull(),
    pendingCount: integer('pending_count').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.connectionId, table.pullRequestNodeId] }),
  ],
);

export const githubWorkflowRunTable = pgTable(
  'github_workflow_run',
  {
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => connectionTable.id, { onDelete: 'cascade' }),
    nodeId: text('node_id').notNull(),
    repositoryNodeId: text('repository_node_id').notNull(),
    pullRequestNodeId: text('pull_request_node_id'),
    workflowName: text('workflow_name').notNull(),
    runNumber: integer('run_number').notNull(),
    branch: text('branch').notNull(),
    headSha: text('head_sha').notNull(),
    event: text('event').notNull(),
    conclusion: text('conclusion', {
      enum: ['failure', 'timed_out', 'startup_failure'],
    }).notNull(),
    url: text('url').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.connectionId, table.nodeId] })],
);

export const githubIssueTable = pgTable(
  'github_issue',
  {
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => connectionTable.id, { onDelete: 'cascade' }),
    nodeId: text('node_id').notNull(),
    repositoryNodeId: text('repository_node_id').notNull(),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    url: text('url').notNull(),
    author: text('author'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.connectionId, table.nodeId] })],
);

/** Who a pull request or issue is waiting on. The feed finds a person's review requests and assigned issues here. */
export const githubAssignmentTable = pgTable(
  'github_assignment',
  {
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => connectionTable.id, { onDelete: 'cascade' }),
    subjectNodeId: text('subject_node_id').notNull(),
    subjectKind: text('subject_kind', {
      enum: ['pull_request', 'issue'],
    }).notNull(),
    login: text('login').notNull(),
    role: text('role', { enum: ['review_requested', 'assignee'] }).notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.connectionId,
        table.subjectNodeId,
        table.login,
        table.role,
      ],
    }),
  ],
);

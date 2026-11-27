/**
 * The GitHub webhook events that change what the feed shows, with the actions that matter, or
 * null where every action does. Anything else is stored and left alone.
 */
export const githubFeedEvents: readonly {
  event: string;
  actions: readonly string[] | null;
}[] = [
  {
    event: 'pull_request',
    actions: [
      'opened',
      'reopened',
      'closed',
      'edited',
      'synchronize',
      'ready_for_review',
      'converted_to_draft',
      'review_requested',
      'review_request_removed',
      'assigned',
      'unassigned',
    ],
  },
  {
    event: 'pull_request_review',
    actions: ['submitted', 'edited', 'dismissed'],
  },
  { event: 'check_suite', actions: null },
  { event: 'check_run', actions: null },
  { event: 'status', actions: null },
  { event: 'workflow_run', actions: null },
  {
    event: 'issues',
    actions: ['assigned', 'unassigned', 'closed', 'reopened', 'edited'],
  },
  { event: 'installation', actions: ['suspend', 'unsuspend'] },
  { event: 'installation_repositories', actions: ['added', 'removed'] },
];

import { describe, expect, it } from 'vitest';

import { InMemoryGithubRecords } from '#src/github-feed/__tests__/support/in-memory-github-records.ts';
import { ReconcileNotRegisteredError } from '#src/github-feed/errors.ts';
import { SourcedGithubReconcile } from '#src/github-feed/services/github-reconcile/github-reconcile.ts';
import { GithubReconcileWorkflows } from '#src/github-feed/services/github-reconcile-workflows/github-reconcile-workflows.ts';

describe('GithubReconcileWorkflows', () => {
  const records = new InMemoryGithubRecords();
  const workflows = new GithubReconcileWorkflows({
    reconcile: new SourcedGithubReconcile({
      sources: [],
      reader: records,
      writer: records,
    }),
  });

  it('refuses to activate before its workflows are registered', async () => {
    await expect(workflows.activate()).rejects.toThrow(
      ReconcileNotRegisteredError,
    );
  });

  it('refuses to start a person’s read before its workflows are registered', async () => {
    await expect(workflows.syncPerson({ userId: 'someone' })).rejects.toThrow(
      ReconcileNotRegisteredError,
    );
  });
});

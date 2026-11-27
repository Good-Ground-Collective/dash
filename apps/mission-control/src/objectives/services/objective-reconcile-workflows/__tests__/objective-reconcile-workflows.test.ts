import { describe, expect, it } from 'vitest';

import { InMemoryObjectiveRecords } from '#src/objectives/__tests__/support/in-memory-objectives.ts';
import { ObjectiveReconcileNotRegisteredError } from '#src/objectives/errors.ts';
import { TrackedObjectiveReconcile } from '#src/objectives/services/objective-reconcile/objective-reconcile.ts';
import { ObjectiveReconcileWorkflows } from '#src/objectives/services/objective-reconcile-workflows/objective-reconcile-workflows.ts';

describe('ObjectiveReconcileWorkflows', () => {
  const records = new InMemoryObjectiveRecords();
  const workflows = new ObjectiveReconcileWorkflows({
    reconcile: new TrackedObjectiveReconcile({
      trackers: [],
      reader: records,
      writer: records,
    }),
  });

  it('refuses to activate before its workflows are registered', async () => {
    await expect(workflows.activate()).rejects.toThrow(
      ObjectiveReconcileNotRegisteredError,
    );
  });

  it('refuses to start a person’s read before its workflows are registered', async () => {
    await expect(workflows.syncPerson({ userId: 'someone' })).rejects.toThrow(
      ObjectiveReconcileNotRegisteredError,
    );
  });
});

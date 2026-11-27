import type { ConnectFlow } from '#src/contracts/connect-flow.ts';
import type { CustomFieldReader } from '#src/contracts/custom-fields.ts';
import type { SourceControl } from '#src/contracts/source-control.ts';
import type { TaskTracker } from '#src/contracts/task-tracker.ts';
import { Capability } from '#src/definitions/capabilities/capability.ts';

export const taskTrackerCapability = new Capability<TaskTracker>({
  name: 'task-tracker',
});

export const sourceControlCapability = new Capability<SourceControl>({
  name: 'source-control',
});

export const customFieldsCapability = new Capability<CustomFieldReader>({
  name: 'custom-fields',
});

/** Installing and authorizing a provider's app, for `owned` connections. */
export const connectFlowCapability = new Capability<ConnectFlow>({
  name: 'connect-flow',
});

import { describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';

import { AppConfig } from '#src/platform/definitions/config/app-config.ts';
import { PlatformModule } from '#src/platform/module.ts';
import type { Database } from '#src/platform/services/database/database.ts';
import type { WorkflowRuntime } from '#src/platform/services/workflows/workflow-runtime.ts';

class RecordingDatabase implements Database {
  closed = false;
  readonly name = 'database';
  readonly orm = drizzle.mock();

  async check(): Promise<void> {}

  async close(): Promise<void> {
    this.closed = true;
  }

  async migrate(): Promise<void> {}
}

class RecordingWorkflowRuntime implements WorkflowRuntime {
  launched = false;
  readonly name = 'workflows';
  readonly shutdownFails: boolean;

  constructor(props: { shutdownFails: boolean }) {
    this.shutdownFails = props.shutdownFails;
  }

  async check(): Promise<void> {}

  async launch(): Promise<void> {
    this.launched = true;
  }

  async shutdown(): Promise<void> {
    if (this.shutdownFails) {
      throw new Error('shutdown failed');
    }
  }
}

const config = new AppConfig({
  NODE_ENV: 'test',
  PORT: '0',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgres://dash:dash@127.0.0.1:54329/mission_control',
});

describe('PlatformModule', () => {
  it('launches workflows, then serves, then stops everything', async () => {
    const database = new RecordingDatabase();
    const workflows = new RecordingWorkflowRuntime({ shutdownFails: false });
    const platform = new PlatformModule({
      config,
      database,
      workflows,
      httpModules: [],
      workflowModules: [],
    });

    await platform.start();
    await platform.stop();

    expect(workflows.launched).toBe(true);
    expect(database.closed).toBe(true);
  });

  it('still closes the database when workflow shutdown fails', async () => {
    const database = new RecordingDatabase();
    const platform = new PlatformModule({
      config,
      database,
      workflows: new RecordingWorkflowRuntime({ shutdownFails: true }),
      httpModules: [],
      workflowModules: [],
    });

    await platform.start();

    await expect(platform.stop()).rejects.toThrow(AggregateError);
    expect(database.closed).toBe(true);
  });
});

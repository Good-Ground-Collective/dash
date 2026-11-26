import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';

import type { WorkflowModule } from '#src/platform/contracts/workflow-module.ts';
import { AppConfig } from '#src/platform/definitions/config/app-config.ts';
import { PlatformModule } from '#src/platform/module.ts';
import type { Database } from '#src/platform/services/database/database.ts';
import type { WorkflowRuntime } from '#src/platform/services/workflows/workflow-runtime.ts';

class RecordingDatabase implements Database {
  readonly events: string[];
  readonly name = 'database';
  readonly orm = drizzle.mock();

  constructor(props: { events: string[] }) {
    this.events = props.events;
  }

  async check(): Promise<void> {}

  async close(): Promise<void> {
    this.events.push('close');
  }

  async migrate(): Promise<void> {}
}

class RecordingWorkflowRuntime implements WorkflowRuntime {
  readonly events: string[];
  readonly name = 'workflows';
  readonly shutdownFails: boolean;

  constructor(props: { events: string[]; shutdownFails: boolean }) {
    this.events = props.events;
    this.shutdownFails = props.shutdownFails;
  }

  async check(): Promise<void> {}

  async launch(): Promise<void> {
    this.events.push('launch');
  }

  async shutdown(): Promise<void> {
    if (this.shutdownFails) {
      throw new Error('shutdown failed');
    }
    this.events.push('shutdown');
  }
}

class RecordingWorkflowModule implements WorkflowModule {
  readonly events: string[];

  constructor(props: { events: string[] }) {
    this.events = props.events;
  }

  async activate(): Promise<void> {
    this.events.push('activate');
  }

  registerWorkflows(): void {
    this.events.push('register');
  }
}

const config = new AppConfig({
  NODE_ENV: 'test',
  PORT: '0',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgres://dash:dash@127.0.0.1:54329/mission_control',
});

describe('PlatformModule', () => {
  it('registers, launches and activates workflows, then stops everything', async () => {
    const events: string[] = [];
    const platform = new PlatformModule({
      config,
      database: new RecordingDatabase({ events }),
      workflows: new RecordingWorkflowRuntime({ events, shutdownFails: false }),
      httpModules: [],
      workflowModules: [new RecordingWorkflowModule({ events })],
    });

    await platform.start();
    await platform.stop();

    expect(events).toEqual([
      'register',
      'launch',
      'activate',
      'shutdown',
      'close',
    ]);
  });

  it('still closes the database when workflow shutdown fails', async () => {
    const events: string[] = [];
    const platform = new PlatformModule({
      config,
      database: new RecordingDatabase({ events }),
      workflows: new RecordingWorkflowRuntime({ events, shutdownFails: true }),
      httpModules: [],
      workflowModules: [],
    });

    await platform.start();

    await expect(platform.stop()).rejects.toThrow(AggregateError);
    expect(events).toEqual(['launch', 'close']);
  });

  it('shuts down once when stop is called twice at the same time', async () => {
    const events: string[] = [];
    const platform = new PlatformModule({
      config,
      database: new RecordingDatabase({ events }),
      workflows: new RecordingWorkflowRuntime({ events, shutdownFails: false }),
      httpModules: [],
      workflowModules: [],
    });
    await platform.start();

    await Promise.all([platform.stop(), platform.stop()]);

    expect(events).toEqual(['launch', 'shutdown', 'close']);
  });
});

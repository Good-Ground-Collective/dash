import { DBOS } from '@dbos-inc/dbos-sdk';

import type { HealthProbe } from '#src/platform/contracts/health-probe.ts';
import type { LogLevel } from '#src/platform/definitions/config/app-config.ts';
import { WorkflowRuntimeError } from '#src/platform/errors.ts';

const dbosLogLevels = {
  fatal: 'error',
  error: 'error',
  warn: 'warn',
  info: 'info',
  debug: 'debug',
  trace: 'debug',
  silent: 'error',
} as const satisfies Record<LogLevel, 'debug' | 'info' | 'warn' | 'error'>;

/** DBOS lifecycle. DBOS keeps its system tables in the `dbos` schema of the application database. */
export class WorkflowRuntime implements HealthProbe {
  readonly name = 'workflows';
  private readonly props: { databaseUrl: string; logLevel: LogLevel };

  constructor(props: { databaseUrl: string; logLevel: LogLevel }) {
    this.props = props;
  }

  async check(): Promise<void> {
    if (!DBOS.isInitialized()) {
      throw new WorkflowRuntimeError({ message: 'DBOS is not launched' });
    }
    await DBOS.getLatestApplicationVersion();
  }

  async launch(): Promise<void> {
    DBOS.setConfig({
      name: 'mission-control',
      systemDatabaseUrl: this.props.databaseUrl,
      systemDatabaseSchemaName: 'dbos',
      logLevel: dbosLogLevels[this.props.logLevel],
    });
    await DBOS.launch();
  }

  async shutdown(): Promise<void> {
    await DBOS.shutdown();
  }
}

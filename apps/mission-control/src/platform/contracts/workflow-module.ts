/** A feature module's DBOS workflows, queues and schedules. */
export interface WorkflowModule {
  /** Registers workflow functions. Runs before DBOS launches. */
  registerWorkflows(): void;
  /** Registers queues and applies schedules, which DBOS stores in Postgres. Runs after launch. */
  activate(): Promise<void>;
}

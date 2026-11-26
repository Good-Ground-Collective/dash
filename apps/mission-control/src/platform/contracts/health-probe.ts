/** A dependency `/healthz` checks. `check` rejects when the dependency is unhealthy. */
export interface HealthProbe {
  readonly name: string;
  check(): Promise<void>;
}

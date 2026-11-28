/** A number `/healthz` reports for operators without it ever failing the health status. `read` rejects when the number can't be had, and `/healthz` then leaves it out. */
export interface HealthGauge {
  readonly name: string;
  read(): Promise<number>;
}

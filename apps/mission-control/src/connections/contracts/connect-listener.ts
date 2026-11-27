/** Told when a person finishes connecting a provider, so other modules can start reading it straight away. */
export interface ConnectListener {
  connected(props: { provider: string; userId: string }): Promise<void>;
}

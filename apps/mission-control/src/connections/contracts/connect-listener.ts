/** Told when a connection becomes readable, so other modules can start reading it straight away. */
export interface ConnectListener {
  connected(props: { provider: string; userId: string }): Promise<void>;
  /** A suspension Dash had recorded was found lifted, and the connection was read again. */
  reinstated(props: {
    provider: string;
    installationId: string;
  }): Promise<void>;
}

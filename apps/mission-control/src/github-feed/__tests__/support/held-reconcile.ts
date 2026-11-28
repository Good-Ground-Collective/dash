import type {
  GithubReconcile,
  StaleConnection,
  SyncOutcome,
} from '#src/github-feed/services/github-reconcile/github-reconcile.ts';

/** Each read waits until the test releases it, so a test can act while a read is running. */
export class HeldReconcile implements GithubReconcile {
  readonly synced: string[] = [];
  due = ['acme'];
  stale: StaleConnection[] = [];
  private readonly holds: PromiseWithResolvers<undefined>[] = [];

  async staleConnections(): Promise<StaleConnection[]> {
    return this.stale;
  }

  async dueConnectionIds(): Promise<string[]> {
    return this.due;
  }

  async connectionIdsOf(): Promise<string[]> {
    return ['acme'];
  }

  async syncConnection(props: { connectionId: string }): Promise<SyncOutcome> {
    const hold = Promise.withResolvers<undefined>();
    this.holds.push(hold);
    this.synced.push(props.connectionId);
    await hold.promise;
    return { status: 'synced' };
  }

  release(): void {
    for (const hold of this.holds.splice(0)) {
      hold.resolve(undefined);
    }
  }
}

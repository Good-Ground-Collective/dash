import type {
  PrincipalKind,
  ServicePrincipal,
} from '#src/auth/contracts/principal.ts';
import { ServiceAccountTakenError } from '#src/auth/errors.ts';
import type {
  ServicePrincipalRecord,
  ServicePrincipalRepository,
} from '#src/auth/repositories/service-principals/service-principal-repository.ts';

/** A `user` row in Better Auth's memory adapter, as far as this fake reads and writes it. */
export interface MemoryUserRow {
  id: string;
  kind?: string;
  name?: string | null;
  email?: string;
  emailVerified?: boolean;
  image?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Service principals in memory. Given Better Auth's memory `user` table, it reads people from it
 * and writes service principals into it, as the Drizzle repository does with Postgres. The bench
 * and agent uniqueness Postgres enforces is enforced here too.
 */
export class InMemoryServicePrincipalRepository implements ServicePrincipalRepository {
  readonly principals = new Map<string, ServicePrincipal>();
  private readonly users: MemoryUserRow[];

  constructor(props: { users?: MemoryUserRow[] } = {}) {
    this.users = props.users ?? [];
  }

  /** Adds a principal of `kind` straight to the user table. */
  addPrincipal(props: { id: string; kind: PrincipalKind }): void {
    this.users.push({ id: props.id, kind: props.kind });
  }

  async create(record: ServicePrincipalRecord): Promise<ServicePrincipal> {
    const taken = [...this.principals.values()].some(
      (principal) =>
        (record.benchId !== null && principal.benchId === record.benchId) ||
        (record.agentName !== null && principal.agentName === record.agentName),
    );
    if (taken) {
      throw new ServiceAccountTakenError({
        identifier: record.benchId ?? record.agentName ?? record.name,
      });
    }

    const createdAt = new Date();
    const principal = { ...record, createdAt: createdAt.toISOString() };
    this.principals.set(record.id, principal);
    this.users.push({
      id: record.id,
      kind: 'service',
      name: record.name,
      email: record.email,
      emailVerified: false,
      image: null,
      createdAt,
      updatedAt: createdAt,
    });
    return principal;
  }

  async findKind(props: { id: string }): Promise<PrincipalKind | null> {
    const row = this.users.find((user) => user.id === props.id);
    if (row === undefined) {
      return null;
    }
    return row.kind === 'service' ? 'service' : 'user';
  }

  async find(props: { id: string }): Promise<ServicePrincipal | null> {
    return this.principals.get(props.id) ?? null;
  }

  async listOwnedBy(props: {
    ownerUserId: string;
  }): Promise<ServicePrincipal[]> {
    return [...this.principals.values()].filter(
      (principal) => principal.ownerUserId === props.ownerUserId,
    );
  }

  async remove(props: { id: string }): Promise<boolean> {
    const index = this.users.findIndex((user) => user.id === props.id);
    if (index !== -1) {
      this.users.splice(index, 1);
    }
    return this.principals.delete(props.id);
  }
}

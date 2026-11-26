import { eq } from 'drizzle-orm';

import {
  type PrincipalKind,
  type ServicePrincipal,
  servicePrincipalSchema,
} from '#src/auth/contracts/principal.ts';
import { ServicePrincipalNotStoredError } from '#src/auth/errors.ts';
import { userTable } from '#src/auth/repositories/auth-store/auth-store-table.ts';
import { serviceProfileTable } from '#src/auth/repositories/service-principals/service-principals-table.ts';
import type { Database } from '#src/platform/services/database/database.ts';

export interface ServicePrincipalRecord {
  id: string;
  email: string;
  name: string;
  ownerUserId: string;
  benchId: string | null;
  agentName: string | null;
  description: string;
}

export interface ServicePrincipalRepository {
  /** The principal's kind, or `null` when no principal has that id. */
  findKind(props: { id: string }): Promise<PrincipalKind | null>;
  /** Stores the `service` principal and its profile together, or neither. */
  create(record: ServicePrincipalRecord): Promise<ServicePrincipal>;
}

export class DrizzleServicePrincipalRepository implements ServicePrincipalRepository {
  private readonly database: Database;

  constructor(props: { database: Database }) {
    this.database = props.database;
  }

  async create(record: ServicePrincipalRecord): Promise<ServicePrincipal> {
    return this.database.orm.transaction(async (transaction) => {
      const [principal] = await transaction
        .insert(userTable)
        .values({
          id: record.id,
          name: record.name,
          email: record.email,
          kind: 'service',
        })
        .returning();

      const [profile] = await transaction
        .insert(serviceProfileTable)
        .values({
          principalId: record.id,
          ownerUserId: record.ownerUserId,
          benchId: record.benchId,
          agentName: record.agentName,
          description: record.description,
        })
        .returning();

      if (principal === undefined || profile === undefined) {
        throw new ServicePrincipalNotStoredError();
      }

      return servicePrincipalSchema.parse({
        id: principal.id,
        email: principal.email,
        name: principal.name,
        ownerUserId: profile.ownerUserId,
        benchId: profile.benchId,
        agentName: profile.agentName,
        description: profile.description,
        createdAt: profile.createdAt.toISOString(),
      });
    });
  }

  async findKind(props: { id: string }): Promise<PrincipalKind | null> {
    const [row] = await this.database.orm
      .select({ kind: userTable.kind })
      .from(userTable)
      .where(eq(userTable.id, props.id));
    return row?.kind ?? null;
  }
}

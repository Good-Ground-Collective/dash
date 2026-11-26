import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';

import {
  type PrincipalKind,
  type ServicePrincipal,
  servicePrincipalSchema,
} from '#src/auth/contracts/principal.ts';
import {
  ServiceAccountTakenError,
  ServicePrincipalNotStoredError,
} from '#src/auth/errors.ts';
import { userTable } from '#src/auth/repositories/auth-store/auth-store-table.ts';
import type { ApiKeyScope } from '#src/auth/definitions/api-key-scopes/api-key-scopes.ts';
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
  scopes: ApiKeyScope[];
}

export interface ServicePrincipalRepository {
  /** The principal's kind, or `null` when no principal has that id. */
  findKind(props: { id: string }): Promise<PrincipalKind | null>;
  /** Stores the `service` principal and its profile together, or neither. Rejects with `ServiceAccountTakenError` when the bench or agent already has one. */
  create(record: ServicePrincipalRecord): Promise<ServicePrincipal>;
  /** `null` for an unknown id and for a person's id alike. */
  find(props: { id: string }): Promise<ServicePrincipal | null>;
  /** Service principals a person owns, oldest first. */
  listOwnedBy(props: { ownerUserId: string }): Promise<ServicePrincipal[]>;
  /** Deletes the principal, its profile and its API keys. `false` when it didn't exist. */
  remove(props: { id: string }): Promise<boolean>;
}

/** Postgres's unique_violation, as node-postgres reports it under Drizzle's query error. */
const uniqueViolationSchema = z.object({
  cause: z.object({ code: z.literal('23505') }),
});

type ProfileRow = typeof serviceProfileTable.$inferSelect;
type PrincipalRow = Pick<
  typeof userTable.$inferSelect,
  'id' | 'email' | 'name'
>;

export class DrizzleServicePrincipalRepository implements ServicePrincipalRepository {
  private readonly database: Database;

  constructor(props: { database: Database }) {
    this.database = props.database;
  }

  async create(record: ServicePrincipalRecord): Promise<ServicePrincipal> {
    try {
      return await this.insert(record);
    } catch (cause) {
      if (uniqueViolationSchema.safeParse(cause).success) {
        throw new ServiceAccountTakenError({
          identifier: record.benchId ?? record.agentName ?? record.name,
        });
      }
      throw cause;
    }
  }

  async findKind(props: { id: string }): Promise<PrincipalKind | null> {
    const [row] = await this.database.orm
      .select({ kind: userTable.kind })
      .from(userTable)
      .where(eq(userTable.id, props.id));
    return row?.kind ?? null;
  }
  async find(props: { id: string }): Promise<ServicePrincipal | null> {
    const [row] = await this.select().where(
      eq(serviceProfileTable.principalId, props.id),
    );
    return row === undefined ? null : this.toServicePrincipal(row);
  }

  async listOwnedBy(props: {
    ownerUserId: string;
  }): Promise<ServicePrincipal[]> {
    const rows = await this.select()
      .where(eq(serviceProfileTable.ownerUserId, props.ownerUserId))
      .orderBy(asc(serviceProfileTable.createdAt));
    return rows.map((row) => this.toServicePrincipal(row));
  }

  async remove(props: { id: string }): Promise<boolean> {
    const deleted = await this.database.orm
      .delete(userTable)
      .where(and(eq(userTable.id, props.id), eq(userTable.kind, 'service')))
      .returning({ id: userTable.id });
    return deleted.length > 0;
  }

  private select() {
    return this.database.orm
      .select({
        principal: {
          id: userTable.id,
          email: userTable.email,
          name: userTable.name,
        },
        profile: serviceProfileTable,
      })
      .from(serviceProfileTable)
      .innerJoin(userTable, eq(userTable.id, serviceProfileTable.principalId));
  }

  private toServicePrincipal(row: {
    principal: PrincipalRow;
    profile: ProfileRow;
  }): ServicePrincipal {
    return servicePrincipalSchema.parse({
      id: row.principal.id,
      email: row.principal.email,
      name: row.principal.name,
      ownerUserId: row.profile.ownerUserId,
      benchId: row.profile.benchId,
      agentName: row.profile.agentName,
      description: row.profile.description,
      scopes: row.profile.scopes,
      createdAt: row.profile.createdAt.toISOString(),
    });
  }

  private async insert(
    record: ServicePrincipalRecord,
  ): Promise<ServicePrincipal> {
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
          scopes: record.scopes,
        })
        .returning();

      if (principal === undefined || profile === undefined) {
        throw new ServicePrincipalNotStoredError();
      }

      return this.toServicePrincipal({ principal, profile });
    });
  }
}

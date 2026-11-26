import {
  type NewServicePrincipal,
  newServicePrincipalSchema,
  serviceEmailDomain,
  type ServicePrincipal,
} from '#src/auth/contracts/principal.ts';
import { ServicePrincipalOwnerError } from '#src/auth/errors.ts';
import type { ServicePrincipalRepository } from '#src/auth/repositories/service-principals/service-principal-repository.ts';

export interface ServicePrincipals {
  /** Creates a `service` principal owned by a person, with a synthetic `svc-<id>@service.invalid` email. */
  create(props: NewServicePrincipal): Promise<ServicePrincipal>;
  /** `null` for an unknown id and for a person's id alike. */
  find(props: { id: string }): Promise<ServicePrincipal | null>;
  /** The service principals a person owns, oldest first. */
  listOwnedBy(props: { ownerUserId: string }): Promise<ServicePrincipal[]>;
  /** Deletes a service principal with its profile and keys. `false` when it didn't exist. */
  remove(props: { id: string }): Promise<boolean>;
}

export class StoredServicePrincipals implements ServicePrincipals {
  private readonly repository: ServicePrincipalRepository;

  constructor(props: { repository: ServicePrincipalRepository }) {
    this.repository = props.repository;
  }

  async create(props: NewServicePrincipal): Promise<ServicePrincipal> {
    const input = newServicePrincipalSchema.parse(props);
    const ownerKind = await this.repository.findKind({ id: input.ownerUserId });
    if (ownerKind !== 'user') {
      throw new ServicePrincipalOwnerError({ ownerUserId: input.ownerUserId });
    }

    const id = crypto.randomUUID();
    return this.repository.create({
      id,
      email: `svc-${id}@${serviceEmailDomain}`,
      name: input.name,
      ownerUserId: input.ownerUserId,
      benchId: input.benchId ?? null,
      agentName: input.agentName ?? null,
      description: input.description,
      scopes: input.scopes,
    });
  }

  async find(props: { id: string }): Promise<ServicePrincipal | null> {
    return this.repository.find(props);
  }

  async listOwnedBy(props: {
    ownerUserId: string;
  }): Promise<ServicePrincipal[]> {
    return this.repository.listOwnedBy(props);
  }

  async remove(props: { id: string }): Promise<boolean> {
    return this.repository.remove(props);
  }
}

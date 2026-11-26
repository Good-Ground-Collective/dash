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
    });
  }
}

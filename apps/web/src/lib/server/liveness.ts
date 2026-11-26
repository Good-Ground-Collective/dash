/** Answers the container healthcheck and kamal-proxy. */
export interface Liveness {
  readonly respond: () => Response;
}

/** Always answers ok. It never calls Mission Control, so web stays up while the API restarts. */
export class StaticLiveness implements Liveness {
  readonly respond = (): Response =>
    new Response('ok', {
      headers: {
        'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8',
      },
    });
}

export const liveness: Liveness = new StaticLiveness();

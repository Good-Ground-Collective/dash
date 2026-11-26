/** Answers the container healthcheck and kamal-proxy. It never calls Mission Control, so web stays up while the API restarts. */
export class Liveness {
  readonly respond = (): Response =>
    new Response('ok', {
      headers: {
        'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8',
      },
    });
}

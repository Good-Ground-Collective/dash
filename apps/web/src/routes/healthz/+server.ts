import { liveness } from '#lib/server/liveness.ts';
import type { RequestHandler } from './$types';

const get: RequestHandler = liveness.respond;

export { get as GET };

import { Liveness } from '#lib/server/liveness.ts';
import type { RequestHandler } from './$types';

const get: RequestHandler = new Liveness().respond;

export { get as GET };

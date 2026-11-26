import type { Handle, HandleFetch } from '@sveltejs/kit/hooks';
import { API_BASE_URL } from '$app/env/public';
import { VisitorContext } from '#lib/server/visitor-context.ts';

const visitorContext = new VisitorContext({ apiBaseUrl: API_BASE_URL });

export const handle: Handle = visitorContext.handle;
export const handleFetch: HandleFetch = visitorContext.handleFetch;

import type { Handle, HandleFetch } from '@sveltejs/kit/hooks';
import { API_BASE_URL } from '$app/env/public';
import {
  CookieVisitorContext,
  type VisitorContext,
} from '#lib/server/visitor-context.ts';

const visitorContext: VisitorContext = new CookieVisitorContext({
  apiBaseUrl: API_BASE_URL,
});

export const handle: Handle = visitorContext.handle;
export const handleFetch: HandleFetch = visitorContext.handleFetch;

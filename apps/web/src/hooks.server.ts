import type { Handle, HandleFetch } from '@sveltejs/kit/hooks';
import { API_BASE_URL } from '$app/env/public';
import { ServerHooks } from '#lib/server/server-hooks.ts';

const serverHooks = new ServerHooks({ apiBaseUrl: API_BASE_URL });

export const handle: Handle = serverHooks.handle;
export const handleFetch: HandleFetch = serverHooks.handleFetch;

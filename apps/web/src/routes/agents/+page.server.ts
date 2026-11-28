import { API_BASE_URL } from '$app/env/public';
import {
  type AgentSessionsLoader,
  MissionControlAgentSessionsLoader,
} from '#lib/server/agents/agent-sessions-loader.ts';
import type { PageServerLoad } from './$types';

const sessionsLoader: AgentSessionsLoader =
  new MissionControlAgentSessionsLoader({ apiBaseUrl: API_BASE_URL });

export const load: PageServerLoad = sessionsLoader.page;

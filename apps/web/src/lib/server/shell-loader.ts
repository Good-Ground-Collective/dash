import type { ServerLoadEvent } from '@sveltejs/kit';
import { ApiClient, type Viewer } from '#lib/api/api-client.ts';

export interface ShellData {
  viewer: Viewer | null;
}

/** Loads what the app shell needs. The shell still renders when Mission Control is unreachable. */
export class ShellLoader {
  private readonly apiBaseUrl: string;

  constructor(props: { apiBaseUrl: string }) {
    this.apiBaseUrl = props.apiBaseUrl;
  }

  readonly load = async (
    event: Pick<ServerLoadEvent, 'fetch' | 'locals'>,
  ): Promise<ShellData> => {
    if (!event.locals.hasSessionCookie) return { viewer: null };
    const api = new ApiClient({ baseUrl: this.apiBaseUrl, fetch: event.fetch });
    try {
      return { viewer: await api.getViewer() };
    } catch (error) {
      console.warn(
        `Mission Control did not return the viewer: ${String(error)}`,
      );
      return { viewer: null };
    }
  };
}

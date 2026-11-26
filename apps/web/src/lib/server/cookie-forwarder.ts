import { z } from 'zod';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';

export const originCookieForwarderPropsSchema = z.object({
  apiBaseUrl: missionControlBaseUrlSchema,
});

export type OriginCookieForwarderProps = z.input<
  typeof originCookieForwarderPropsSchema
>;

/** Decides which server-side requests carry the browser's cookies. */
export interface CookieForwarder {
  forward(props: { request: Request; cookie: string | null }): Request;
}

/** Forwards cookies only to requests bound for Mission Control's origin. */
export class OriginCookieForwarder implements CookieForwarder {
  private readonly apiOrigin: string;

  constructor(props: OriginCookieForwarderProps) {
    this.apiOrigin = new URL(
      originCookieForwarderPropsSchema.parse(props).apiBaseUrl,
    ).origin;
  }

  forward(props: { request: Request; cookie: string | null }): Request {
    if (
      props.cookie === null ||
      new URL(props.request.url).origin !== this.apiOrigin
    ) {
      return props.request;
    }

    const headers = new Headers(props.request.headers);
    headers.set('cookie', props.cookie);
    return new Request(props.request, { headers });
  }
}

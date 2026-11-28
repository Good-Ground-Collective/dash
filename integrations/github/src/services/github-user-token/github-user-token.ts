import { GrantRevokedError } from '@dash/integrations-core';
import { z } from 'zod';

/** How `@octokit/request` reports an HTTP error. */
export const githubErrorStatusSchema = z.object({ status: z.number() });

/** Calls GitHub as a person, with their GitHub App user token. */
export class GithubUserToken {
  /** GitHub answers 401 to a user token that was revoked or has expired, which becomes `GrantRevokedError`. */
  static async call<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (githubErrorStatusSchema.safeParse(error).data?.status === 401) {
        throw new GrantRevokedError({ provider: 'github', cause: error });
      }
      throw error;
    }
  }

  static bearer(props: { accessToken: string }) {
    return { authorization: `Bearer ${props.accessToken}` };
  }
}

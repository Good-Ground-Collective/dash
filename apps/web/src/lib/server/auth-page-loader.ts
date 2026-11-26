import { redirect, type ServerLoadEvent } from '@sveltejs/kit';
import { z } from 'zod';
import {
  HttpMissionControl,
  missionControlBaseUrlSchema,
  type Passkey,
  type PasskeyReads,
  type ServiceAccountReads,
  type Viewer,
  viewerSchema,
} from '#lib/api/mission-control.ts';
import type { ServiceAccount } from '#lib/api/service-account-contracts.ts';

export const authPageLoaderPropsSchema = z.object({
  apiBaseUrl: missionControlBaseUrlSchema,
});

export type AuthPageLoaderProps = z.input<typeof authPageLoaderPropsSchema>;

/** The root layout's data, which every page load can read through `parent()`. */
export const shellDataSchema = z.object({ viewer: viewerSchema.nullable() });

export type AuthPageLoadEvent = Pick<ServerLoadEvent, 'fetch' | 'parent'>;

export interface SetupPageData {
  /** `null` when Mission Control couldn't say. */
  open: boolean | null;
}

export interface SignInPageData {
  setupOpen: boolean;
}

export interface SettingsPageData {
  viewer: Viewer;
  /** `null` when Mission Control couldn't list them. */
  passkeys: Passkey[] | null;
}

export interface ServiceAccountsPageData {
  viewer: Viewer;
  /** `null` when Mission Control couldn't list them. */
  serviceAccounts: ServiceAccount[] | null;
}

/** Loads for the pages around signing in. Signed-in visitors skip setup and sign-in; signed-out ones are sent to sign in from settings and service accounts. */
export interface AuthPageLoader {
  readonly setup: (event: AuthPageLoadEvent) => Promise<SetupPageData>;
  readonly signIn: (event: AuthPageLoadEvent) => Promise<SignInPageData>;
  readonly settings: (event: AuthPageLoadEvent) => Promise<SettingsPageData>;
  readonly serviceAccounts: (
    event: AuthPageLoadEvent,
  ) => Promise<ServiceAccountsPageData>;
}

export class MissionControlAuthPageLoader implements AuthPageLoader {
  private readonly apiBaseUrl: string;

  constructor(props: AuthPageLoaderProps) {
    this.apiBaseUrl = authPageLoaderPropsSchema.parse(props).apiBaseUrl;
  }

  readonly setup = async (event: AuthPageLoadEvent): Promise<SetupPageData> => {
    if ((await this.viewer(event)) !== null) redirect(303, '/');
    return { open: await this.setupOpen(event) };
  };

  readonly signIn = async (
    event: AuthPageLoadEvent,
  ): Promise<SignInPageData> => {
    if ((await this.viewer(event)) !== null) redirect(303, '/');
    return { setupOpen: (await this.setupOpen(event)) === true };
  };

  readonly settings = async (
    event: AuthPageLoadEvent,
  ): Promise<SettingsPageData> => {
    const viewer = await this.viewer(event);
    if (viewer === null) redirect(303, '/sign-in');
    try {
      return { viewer, passkeys: await this.reads(event).listPasskeys() };
    } catch (error) {
      console.warn(`Mission Control did not list passkeys: ${String(error)}`);
      return { viewer, passkeys: null };
    }
  };

  readonly serviceAccounts = async (
    event: AuthPageLoadEvent,
  ): Promise<ServiceAccountsPageData> => {
    const viewer = await this.viewer(event);
    if (viewer === null) redirect(303, '/sign-in');
    try {
      return {
        viewer,
        serviceAccounts: await this.reads(event).listServiceAccounts(),
      };
    } catch (error) {
      console.warn(
        `Mission Control did not list service accounts: ${String(error)}`,
      );
      return { viewer, serviceAccounts: null };
    }
  };

  private async viewer(event: AuthPageLoadEvent): Promise<Viewer | null> {
    return shellDataSchema.parse(await event.parent()).viewer;
  }

  private async setupOpen(event: AuthPageLoadEvent): Promise<boolean | null> {
    try {
      return (await this.reads(event).getSetupStatus()).open;
    } catch (error) {
      console.warn(
        `Mission Control did not report setup status: ${String(error)}`,
      );
      return null;
    }
  }

  private reads(event: AuthPageLoadEvent): PasskeyReads & ServiceAccountReads {
    return new HttpMissionControl({
      baseUrl: this.apiBaseUrl,
      fetch: event.fetch,
    });
  }
}

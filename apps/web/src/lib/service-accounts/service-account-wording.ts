import { MissionControlError } from '#lib/api/mission-control-error.ts';
import type {
  ApiKeyScope,
  ApiKeySummary,
  ServiceAccount,
} from '#lib/api/service-account-contracts.ts';

const scopeLabels = {
  'heartbeat:write': 'Heartbeats',
  'telemetry:write': 'Telemetry',
} as const satisfies Record<ApiKeyScope, string>;

const scopeDescriptions = {
  'heartbeat:write': 'Report that an agent is alive.',
  'telemetry:write': 'Send usage and activity.',
} as const satisfies Record<ApiKeyScope, string>;

const messages: ReadonlyMap<string, string> = new Map([
  [
    'SESSION_NOT_FRESH',
    'Confirm it’s you with a passkey to change service accounts.',
  ],
  ['SERVICE_ACCOUNT_NOT_FOUND', 'That service account is already gone.'],
  ['API_KEY_NOT_FOUND', 'That key is already revoked.'],
]);

const dateFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

const relativeFormat = new Intl.RelativeTimeFormat('en-US', {
  numeric: 'auto',
});

const units: readonly { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] =
  [
    { unit: 'day', seconds: 86_400 },
    { unit: 'hour', seconds: 3600 },
    { unit: 'minute', seconds: 60 },
  ];

/** What the service account page says about accounts, keys and errors. */
export interface ServiceAccountWording {
  scopeLabel(scope: ApiKeyScope): string;
  scopeDescription(scope: ApiKeyScope): string;
  /** “Bench · studio-mac” or “Agent · ci-reviewer”. */
  identity(account: ServiceAccount): string;
  /** The latest use of any of the account's keys, or `null` if none was used. */
  lastUsed(account: ServiceAccount): Date | null;
  /** “Used 4 minutes ago”, or “Never used”. Within a minute it is “just now”. */
  used(lastUsedAt: Date | null, now: Date): string;
  /** “Never expires”, “Expires Feb 24, 2027” or “Expired”. */
  expiry(key: ApiKeySummary, now: Date): string;
  /** A key's visible start with an ellipsis, so it reads as a fragment. */
  start(key: ApiKeySummary): string;
  /** A sentence for the person, from Mission Control's error code or message. */
  explain(cause: unknown): string;
}

/** The page's wording in US English, with dates in UTC. */
export class EnglishServiceAccountWording implements ServiceAccountWording {
  scopeLabel(scope: ApiKeyScope): string {
    return scopeLabels[scope];
  }

  scopeDescription(scope: ApiKeyScope): string {
    return scopeDescriptions[scope];
  }

  identity(account: ServiceAccount): string {
    return account.kind === 'bench'
      ? `Bench · ${account.benchId ?? ''}`
      : `Agent · ${account.agentName ?? ''}`;
  }

  lastUsed(account: ServiceAccount): Date | null {
    const used = account.keys
      .map((key) => key.lastUsedAt?.getTime())
      .filter((time) => time !== undefined);
    return used.length === 0 ? null : new Date(Math.max(...used));
  }

  used(lastUsedAt: Date | null, now: Date): string {
    if (lastUsedAt === null) return 'Never used';
    const seconds = Math.round((lastUsedAt.getTime() - now.getTime()) / 1000);
    if (Math.abs(seconds) < 60) return 'Used just now';
    const scale = units.find(
      (candidate) => Math.abs(seconds) >= candidate.seconds,
    );
    const unit = scale ?? { unit: 'minute', seconds: 60 };
    if (unit.unit === 'day' && Math.abs(seconds) >= 30 * 86_400) {
      return `Last used ${dateFormat.format(lastUsedAt)}`;
    }
    return `Used ${relativeFormat.format(Math.round(seconds / unit.seconds), unit.unit)}`;
  }

  expiry(key: ApiKeySummary, now: Date): string {
    if (key.expiresAt === null) return 'Never expires';
    if (key.expiresAt.getTime() <= now.getTime()) return 'Expired';
    return `Expires ${dateFormat.format(key.expiresAt)}`;
  }

  start(key: ApiKeySummary): string {
    return key.start === null ? 'Key' : `${key.start}…`;
  }

  explain(cause: unknown): string {
    if (!(cause instanceof MissionControlError)) {
      return 'Something went wrong. Try again.';
    }
    return messages.get(cause.code) ?? cause.message;
  }
}

export const serviceAccountWording: ServiceAccountWording =
  new EnglishServiceAccountWording();

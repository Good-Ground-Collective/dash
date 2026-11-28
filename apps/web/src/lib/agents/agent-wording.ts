import type {
  AgentActivity,
  AgentLiveness,
  AgentStatus,
} from '#lib/agents/agent-session-contracts.ts';

export type AgentTone = 'ok' | 'warn' | 'bad' | 'muted';

const statusLabels = {
  working: 'working',
  waiting: 'waiting',
  question: 'asking',
  blocked: 'blocked',
  complete: 'done',
  failed: 'failed',
  error: 'errored',
} satisfies Record<AgentStatus, string>;

const statusTones = {
  working: 'ok',
  waiting: 'muted',
  question: 'warn',
  blocked: 'warn',
  complete: 'muted',
  failed: 'bad',
  error: 'bad',
} satisfies Record<AgentStatus, AgentTone>;

/** The words and tones the Agents page uses for what agents report. */
export class AgentWording {
  static readonly STALE_AFTER_MINUTES = 10;
  static readonly LOST_AFTER_MINUTES = 30;

  /** Lowercase, so counts read “12 working, 3 done”. */
  static statusLabel(status: AgentStatus): string {
    return statusLabels[status];
  }

  /** “Working”, “Asking”, “Done”. */
  static statusPill(status: AgentStatus): string {
    const label = statusLabels[status];
    return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
  }

  static statusTone(status: AgentStatus): AgentTone {
    return statusTones[status];
  }

  /** `null` while the agent is reporting. */
  static livenessPill(liveness: AgentLiveness): string | null {
    if (liveness === 'live') return null;
    return liveness === 'stale' ? 'Stale' : 'Lost';
  }

  static livenessTone(liveness: AgentLiveness): AgentTone {
    return liveness === 'lost' ? 'bad' : 'warn';
  }

  /** Why the watchdog flagged it, for the pill's tooltip. */
  static livenessHint(liveness: AgentLiveness): string | null {
    if (liveness === 'live') return null;
    return liveness === 'stale'
      ? `Working, but silent for over ${AgentWording.STALE_AFTER_MINUTES} minutes`
      : `Working, but silent for over ${AgentWording.LOST_AFTER_MINUTES} minutes`;
  }

  /** What failed, as the agent reported it. */
  static errorText(activity: AgentActivity): string | null {
    if (activity.error === null) return null;
    return `${activity.error.kind}: ${activity.error.message}`;
  }

  /** The repository and branch it works in, else its directory, else its machine. `null` when it reported none. */
  static where(activity: AgentActivity | null): string | null {
    if (activity === null) return null;
    const { workspace } = activity;
    const repository = [workspace?.repository, workspace?.branch]
      .filter((part) => part !== undefined)
      .join(' · ');
    return (
      [repository, workspace?.directory, activity.machine].find(
        (place) => place !== undefined && place !== null && place !== '',
      ) ?? null
    );
  }
}

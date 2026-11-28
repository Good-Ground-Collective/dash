import { z } from 'zod';

import type { AgentSessionRepository } from '#src/agents/repositories/agent-sessions/agent-session-repository.ts';
import type { ServicePrincipalRepository } from '#src/auth/repositories/service-principals/service-principal-repository.ts';
import type { BriefingDraft } from '#src/briefing/contracts/briefing-draft.ts';
import {
  type BriefingConnectionDraft,
  type BriefingCounts,
  type BriefingSnapshotDigest,
  briefingSnapshotSchema,
} from '#src/briefing/contracts/briefing-snapshot.ts';
import { briefingLimits } from '#src/briefing/definitions/briefing-limits/briefing-limits.ts';
import { BriefingAgentSections } from '#src/briefing/services/briefing-agent-sections/briefing-agent-sections.ts';
import { BriefingChangeSections } from '#src/briefing/services/briefing-change-sections/briefing-change-sections.ts';
import { BriefingFit } from '#src/briefing/services/briefing-fit/briefing-fit.ts';
import { BriefingGithubSections } from '#src/briefing/services/briefing-github-sections/briefing-github-sections.ts';
import { BriefingObjectiveSections } from '#src/briefing/services/briefing-objective-sections/briefing-objective-sections.ts';
import { BriefingText } from '#src/briefing/services/briefing-text/briefing-text.ts';
import type { GithubRecordReader } from '#src/github-feed/repositories/github-records/github-record-reader.ts';
import { GithubFeedAssembly } from '#src/github-feed/services/github-feed-assembly/github-feed-assembly.ts';
import type { ObjectiveOverlayRepository } from '#src/objectives/repositories/objective-overlays/objective-overlay-repository.ts';
import type { ObjectiveRecordReader } from '#src/objectives/repositories/objective-records/objective-record-reader.ts';
import { ObjectivesAssembly } from '#src/objectives/services/objectives-assembly/objectives-assembly.ts';

const sourcedBriefingSnapshotPropsSchema = z.object({
  objectives: z.custom<Pick<ObjectiveRecordReader, 'recordsFor'>>(),
  overlays: z.custom<Pick<ObjectiveOverlayRepository, 'listFor'>>(),
  github: z.custom<Pick<GithubRecordReader, 'recordsFor'>>(),
  sessions: z.custom<Pick<AgentSessionRepository, 'listUpdatedSince'>>(),
  principals: z.custom<Pick<ServicePrincipalRepository, 'listOwnedBy'>>(),
});

export interface BriefingSnapshot {
  /** One person's objectives, GitHub work, agents, benches and connection health as Dash stored them at `now`, trimmed to fixed caps and a character budget. Holds what changed since `previousBriefingAt`, or in the last 24 hours when the person has no earlier briefing. Reads nothing from a provider. */
  of(props: {
    userId: string;
    now: Date;
    previousBriefingAt: Date | null;
  }): Promise<BriefingSnapshotDigest>;
}

/**
 * The snapshot the briefing writer reads, built from the same readers and assemblies the
 * objectives, GitHub feed and agent sessions endpoints use, so it holds nothing they don't.
 * Agents are the sessions the person's service accounts reported in the last 24 hours.
 * `counts` report each source before trimming.
 */
export class SourcedBriefingSnapshot implements BriefingSnapshot {
  private readonly objectives: Pick<ObjectiveRecordReader, 'recordsFor'>;
  private readonly overlays: Pick<ObjectiveOverlayRepository, 'listFor'>;
  private readonly github: Pick<GithubRecordReader, 'recordsFor'>;
  private readonly sessions: Pick<AgentSessionRepository, 'listUpdatedSince'>;
  private readonly principals: Pick<ServicePrincipalRepository, 'listOwnedBy'>;

  constructor(props: z.input<typeof sourcedBriefingSnapshotPropsSchema>) {
    const parsed = sourcedBriefingSnapshotPropsSchema.parse(props);
    this.objectives = parsed.objectives;
    this.overlays = parsed.overlays;
    this.github = parsed.github;
    this.sessions = parsed.sessions;
    this.principals = parsed.principals;
  }

  async of(props: {
    userId: string;
    now: Date;
    previousBriefingAt: Date | null;
  }): Promise<BriefingSnapshotDigest> {
    const { userId, now, previousBriefingAt } = props;
    const [objectiveRecords, overlays, githubRecords, states, principals] =
      await Promise.all([
        this.objectives.recordsFor({ connectedBy: userId }),
        this.overlays.listFor({ userId }),
        this.github.recordsFor({ connectedBy: userId }),
        this.sessions.listUpdatedSince({
          since: new Date(
            now.getTime() - briefingLimits.agentWindowMilliseconds,
          ),
        }),
        this.principals.listOwnedBy({ ownerUserId: userId }),
      ]);

    const objectives = ObjectivesAssembly.assemble({
      connections: objectiveRecords,
      overlays,
      statuses: ['active'],
      now,
    });
    const feed = GithubFeedAssembly.assemble(githubRecords);
    const sessions = BriefingAgentSections.sessionsOf({ states, principals });

    const draft: BriefingDraft = {
      sinceLastBriefing: SourcedBriefingSnapshot.changesSince({
        connections: objectiveRecords,
        overlays,
        now,
        previousBriefingAt,
      }),
      initiatives: BriefingObjectiveSections.initiatives(objectives),
      ...BriefingGithubSections.sections(feed),
      agents: BriefingAgentSections.agents(sessions),
      benches: BriefingAgentSections.benches({ principals, sessions }),
      connections: SourcedBriefingSnapshot.connections([
        ...objectives.connections.map((connection) => ({
          source: 'objectives' as const,
          ...connection,
        })),
        ...feed.connections.map((connection) => ({
          source: 'github' as const,
          ...connection,
        })),
      ]),
    };
    const counts: BriefingCounts = {
      objectives: BriefingObjectiveSections.total(objectives),
      ...BriefingGithubSections.counts(feed),
      agents: sessions.length,
      benches: BriefingAgentSections.benchCount(principals),
    };

    return briefingSnapshotSchema.parse(
      BriefingFit.digest({ draft, takenAt: now.toISOString(), counts }),
    );
  }

  private static changesSince(props: {
    connections: Parameters<
      typeof ObjectivesAssembly.assemble
    >[0]['connections'];
    overlays: Parameters<typeof ObjectivesAssembly.assemble>[0]['overlays'];
    now: Date;
    previousBriefingAt: Date | null;
  }): BriefingDraft['sinceLastBriefing'] {
    const { now, previousBriefingAt } = props;
    return BriefingChangeSections.since({
      connections: props.connections,
      objectives: ObjectivesAssembly.assemble({
        connections: props.connections,
        overlays: props.overlays,
        statuses: ['active', 'parked', 'done'],
        now,
      }),
      since:
        previousBriefingAt ??
        new Date(now.getTime() - briefingLimits.fallbackWindowMilliseconds),
      previousBriefingAt,
    });
  }

  private static connections(
    connections: readonly {
      source: 'objectives' | 'github';
      accountLogin: string;
      lastSyncedAt: string | null;
      truncated: boolean | null;
      lastError: string | null;
    }[],
  ): BriefingConnectionDraft[] {
    return connections
      .slice(0, briefingLimits.connections)
      .map((connection) => ({
        source: connection.source,
        accountLogin: BriefingText.cap(
          connection.accountLogin,
          briefingLimits.nameLength,
        ),
        lastSyncedAt: connection.lastSyncedAt,
        truncated: connection.truncated,
        lastError: BriefingText.capped(
          connection.lastError,
          briefingLimits.textLength,
        ),
      }));
  }
}

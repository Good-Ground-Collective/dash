import type { Activity, TrackerSnapshot } from '@dash/integrations-core';

import { InMemoryServicePrincipalRepository } from '#src/auth/__tests__/support/in-memory-service-principals.ts';
import { StoredAgentSessions } from '#src/briefing/__tests__/support/stored-agent-sessions.ts';
import { SourcedBriefingSnapshot } from '#src/briefing/services/briefing-snapshot/briefing-snapshot.ts';
import {
  GithubFeedFixtures,
  ownedId as githubConnectionId,
} from '#src/github-feed/__tests__/support/github-feed-fixtures.ts';
import { InMemoryGithubRecords } from '#src/github-feed/__tests__/support/in-memory-github-records.ts';
import { ActivityRecords } from '#src/github-feed/services/activity-records/activity-records.ts';
import {
  InMemoryObjectiveOverlays,
  InMemoryObjectiveRecords,
} from '#src/objectives/__tests__/support/in-memory-objectives.ts';
import {
  adaId,
  ObjectivesFixtures,
  ownedId,
} from '#src/objectives/__tests__/support/objectives-fixtures.ts';
import { TrackerRecords } from '#src/objectives/services/tracker-records/tracker-records.ts';

export const briefedPersonId = adaId;
export const otherPersonId = '00000000-0000-4000-8000-00000000000b';
export const syncedAt = new Date('2026-11-26T11:30:00.000Z');

/** Ada's stored data in memory, ready to snapshot: both of her connections read, and her service accounts and what they reported. */
export class BriefingWorld {
  readonly objectives = new InMemoryObjectiveRecords();
  readonly overlays = new InMemoryObjectiveOverlays();
  readonly github = new InMemoryGithubRecords();
  readonly sessions = new StoredAgentSessions();
  readonly principals = new InMemoryServicePrincipalRepository();

  snapshot(): SourcedBriefingSnapshot {
    return new SourcedBriefingSnapshot({
      objectives: this.objectives,
      overlays: this.overlays,
      github: this.github,
      sessions: this.sessions,
      principals: this.principals,
    });
  }

  async storeObjectives(
    tracker: TrackerSnapshot = ObjectivesFixtures.snapshot(),
  ): Promise<this> {
    this.objectives.add(ObjectivesFixtures.target());
    await this.objectives.replace({
      connectionId: ownedId,
      records: TrackerRecords.from(tracker),
      truncated: false,
      syncedAt,
    });
    return this;
  }

  async storeGithub(
    activity: Activity = GithubFeedFixtures.activity(),
  ): Promise<this> {
    this.github.add(GithubFeedFixtures.target());
    await this.github.replace({
      connectionId: githubConnectionId,
      viewerLogin: 'ada',
      records: ActivityRecords.from({ activity, viewerLogin: 'ada' }),
      releaseReads: [],
      truncated: false,
      syncedAt,
    });
    return this;
  }

  async addBench(props: {
    id: string;
    benchId: string;
    ownerUserId?: string;
  }): Promise<void> {
    await this.principals.create({
      id: props.id,
      email: `svc-${props.id}@service.invalid`,
      name: props.benchId,
      ownerUserId: props.ownerUserId ?? briefedPersonId,
      benchId: props.benchId,
      agentName: null,
      description: `The ${props.benchId} desk`,
      hue: 'blue',
      scopes: ['heartbeat:write', 'telemetry:write'],
    });
  }

  async addAgentAccount(props: {
    id: string;
    agentName: string;
  }): Promise<void> {
    await this.principals.create({
      id: props.id,
      email: `svc-${props.id}@service.invalid`,
      name: props.agentName,
      ownerUserId: briefedPersonId,
      benchId: null,
      agentName: props.agentName,
      description: 'Runs in CI',
      hue: 'green',
      scopes: ['heartbeat:write'],
    });
  }
}

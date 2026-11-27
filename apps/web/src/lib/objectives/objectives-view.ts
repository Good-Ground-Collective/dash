import { z } from 'zod';
import type {
  InitiativeObjective,
  Objectives,
} from '#lib/api/objectives-contracts.ts';
import {
  type ObjectiveRow,
  ObjectiveRows,
} from '#lib/objectives/objective-rows.ts';
import {
  type OverlayActionSet,
  OverlayActions,
} from '#lib/objectives/overlay-actions.ts';

/** GitHub's guide to creating a Project, which is how an initiative starts. */
export const createProjectHelpUrl =
  'https://docs.github.com/issues/planning-and-tracking-with-projects/creating-projects/creating-a-project';

/** What home got from Mission Control: the objectives, or `failed` when it didn't answer. */
export type ObjectivesState =
  | {
      status: 'loaded';
      objectives: Objectives;
      /** Whether any GitHub connection exists, which `/objectives` can't say before a connection's first read. */
      githubConnected: boolean;
      /** Whether any initiative exists in any status, so an empty filtered list can say they're hidden. */
      anyInitiative: boolean;
    }
  | { status: 'failed' };

/** `filtered-out` when initiatives exist but none match the filter. */
export type ObjectivesStatus =
  | 'failed'
  | 'not-connected'
  | 'first-sync'
  | 'empty'
  | 'filtered-out'
  | 'ready';

export interface ObjectiveEntry {
  row: ObjectiveRow;
  actions: OverlayActionSet;
}

export interface InitiativeEntry extends ObjectiveEntry {
  epics: ObjectiveEntry[];
}

export interface ConnectionNotice {
  id: string;
  login: string;
  message: string;
}

export const objectivesViewPropsSchema = z.object({
  state: z.custom<ObjectivesState>(),
});

export type ObjectivesViewProps = z.input<typeof objectivesViewPropsSchema>;

/** Home's objectives panel: which state it's in, its initiatives with their epics, and what each connection's last read said. */
export class ObjectivesView {
  private readonly state: ObjectivesState;

  constructor(props: ObjectivesViewProps) {
    this.state = objectivesViewPropsSchema.parse(props).state;
  }

  get status(): ObjectivesStatus {
    if (this.state.status === 'failed') return 'failed';
    const { objectives, githubConnected, anyInitiative } = this.state;
    if (objectives.initiatives.length > 0) return 'ready';

    const { connections } = objectives;
    if (connections.length === 0) {
      return githubConnected ? 'first-sync' : 'not-connected';
    }
    const reading = connections.every(
      ({ lastSyncedAt, lastError }) =>
        lastSyncedAt === null && lastError === null,
    );
    if (reading) return 'first-sync';
    return anyInitiative ? 'filtered-out' : 'empty';
  }

  get initiatives(): InitiativeEntry[] {
    if (this.state.status === 'failed') return [];
    return this.state.objectives.initiatives.map((initiative) =>
      ObjectivesView.entry(initiative),
    );
  }

  get notices(): ConnectionNotice[] {
    if (this.state.status === 'failed') return [];
    return this.state.objectives.connections.flatMap((connection) => {
      const message =
        connection.lastError ??
        (connection.truncated === true
          ? 'This account has more Projects or epics than Dash reads, so only the most recent show.'
          : null);
      return message === null
        ? []
        : [{ id: connection.id, login: connection.accountLogin, message }];
    });
  }

  private static entry(initiative: InitiativeObjective): InitiativeEntry {
    return {
      row: ObjectiveRows.of(initiative),
      actions: OverlayActions.for(initiative),
      epics: initiative.epics.map((epic) => ({
        row: ObjectiveRows.of(epic),
        actions: OverlayActions.for(epic),
      })),
    };
  }
}

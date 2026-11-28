import type { BriefingInitiativeDraft } from '#src/briefing/contracts/briefing-draft.ts';
import type { BriefingObjectiveDraft } from '#src/briefing/contracts/briefing-snapshot.ts';
import { briefingLimits } from '#src/briefing/definitions/briefing-limits/briefing-limits.ts';
import { BriefingText } from '#src/briefing/services/briefing-text/briefing-text.ts';
import type {
  EpicObjective,
  InitiativeObjective,
  Objectives,
} from '#src/objectives/contracts/objectives.ts';

/** The objectives `GET /objectives` returns, cut to the initiatives and epics a snapshot keeps. The assembly's order is kept: priority, then due date. */
export class BriefingObjectiveSections {
  static initiatives(objectives: Objectives): BriefingInitiativeDraft[] {
    return objectives.initiatives
      .slice(0, briefingLimits.initiatives)
      .map((initiative) => ({
        initiative: BriefingObjectiveSections.objective({
          kind: 'initiative',
          objective: initiative,
        }),
        epics: initiative.epics
          .slice(0, briefingLimits.epicsPerInitiative)
          .map((epic) =>
            BriefingObjectiveSections.objective({
              kind: 'epic',
              objective: epic,
            }),
          ),
      }));
  }

  /** Initiatives and epics together, before any cap. */
  static total(objectives: Objectives): number {
    return objectives.initiatives.reduce(
      (total, initiative) => total + 1 + initiative.epics.length,
      0,
    );
  }

  private static objective(props: {
    kind: 'initiative' | 'epic';
    objective: InitiativeObjective | EpicObjective;
  }): BriefingObjectiveDraft {
    const { kind, objective } = props;
    const { latestUpdate, nextTicket } = objective;
    return {
      kind,
      title: BriefingText.cap(objective.title, briefingLimits.titleLength),
      url: objective.url,
      status: objective.status,
      priority: objective.priority?.value ?? null,
      dueDate: objective.dueDate?.value ?? null,
      progress: objective.progress,
      lastActivityAt: objective.lastActivityAt,
      hints: objective.hints,
      dueAfterInitiative:
        'dueAfterInitiative' in objective && objective.dueAfterInitiative,
      latestUpdate:
        latestUpdate === null
          ? null
          : {
              kind: latestUpdate.kind,
              occurredAt: latestUpdate.occurredAt,
              actor: BriefingText.capped(
                latestUpdate.actor,
                briefingLimits.nameLength,
              ),
              url: latestUpdate.url,
              ticketTitle: BriefingText.cap(
                latestUpdate.ticket.title,
                briefingLimits.titleLength,
              ),
            },
      nextTicket:
        nextTicket === null
          ? null
          : {
              title: BriefingText.cap(
                nextTicket.title,
                briefingLimits.titleLength,
              ),
              url: nextTicket.url,
            },
    };
  }
}

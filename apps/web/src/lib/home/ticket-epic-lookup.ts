import { z } from 'zod';
import type { GithubFeedIssueReference } from '#lib/api/github-feed-contracts.ts';
import type {
  EpicObjective,
  InitiativeObjective,
} from '#lib/api/objectives-contracts.ts';
import type { ObjectivesState } from '#lib/objectives/objectives-view.ts';

export const ticketEpicLookupPropsSchema = z.object({
  objectives: z.custom<ObjectivesState | null>(),
});

export type TicketEpicLookupProps = z.input<typeof ticketEpicLookupPropsSchema>;

/** An epic and the initiative it belongs to. */
export interface EpicPlacement {
  epic: EpicObjective;
  initiative: InitiativeObjective;
}

const issueUrlSchema = z
  .string()
  .regex(/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+$/iu)
  .transform((url) => {
    const [owner, repository, , number] = new URL(url).pathname
      .slice(1)
      .split('/');
    return `${owner}/${repository}#${number}`.toLowerCase();
  });

/** Which epic an issue is a task of, read from the epics Today's focus already loaded. */
export class TicketEpicLookup {
  private readonly placements = new Map<string, EpicPlacement>();

  constructor(props: TicketEpicLookupProps) {
    const { objectives } = ticketEpicLookupPropsSchema.parse(props);
    if (objectives?.status !== 'loaded') return;

    for (const initiative of objectives.objectives.initiatives) {
      for (const epic of initiative.epics) {
        const placement = { epic, initiative };
        this.remember(epic.url, placement);
        for (const url of epic.tasks.urls) this.remember(url, placement);
      }
    }
  }

  /** The epic an issue belongs to, or `null` when it isn't a task of any epic Home knows. */
  placementOf(issue: GithubFeedIssueReference): EpicPlacement | null {
    return this.placements.get(TicketEpicLookup.key(issue)) ?? null;
  }

  private remember(url: string, placement: EpicPlacement): void {
    const parsed = issueUrlSchema.safeParse(url);
    if (parsed.success && !this.placements.has(parsed.data)) {
      this.placements.set(parsed.data, placement);
    }
  }

  /** Tells two references to one issue apart from references to two issues. */
  static key(issue: GithubFeedIssueReference): string {
    return `${issue.repository}#${String(issue.number)}`.toLowerCase();
  }
}

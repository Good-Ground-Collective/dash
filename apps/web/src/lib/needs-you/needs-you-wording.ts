import type { NeedsYouItem } from '#lib/needs-you/needs-you-contracts.ts';

/** The words a Needs you row shows for an item. */
export class NeedsYouWording {
  static pill(item: NeedsYouItem): string {
    return item.question === null ? 'Needs input' : 'Question';
  }

  /** The question as the agent sent it. */
  static headline(item: NeedsYouItem): string {
    return item.question?.text ?? 'An agent is waiting for you';
  }

  /** The subagent that asked, or the session itself. */
  static agent(item: NeedsYouItem): string {
    return item.agentId ?? 'Main session';
  }

  /** Where the agent runs, until its session is known. */
  static place(where: string | null): string {
    return where ?? 'Unknown bench';
  }
}

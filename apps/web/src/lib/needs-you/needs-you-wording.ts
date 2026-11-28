import type { NeedsYouItem } from '#lib/needs-you/needs-you-contracts.ts';

const shortSessionLength = 8;

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

  /** Where the agent runs, or the shortened session id until that is known. */
  static place(props: { item: NeedsYouItem; where: string | null }): string {
    return (
      props.where ??
      `session ${props.item.sessionId.slice(0, shortSessionLength)}`
    );
  }
}

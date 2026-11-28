import type { InferSelectModel } from 'drizzle-orm';
import { z } from 'zod';

import type { NeedsYouItem } from '#src/agents/contracts/needs-you-item.ts';
import { parentAgentId } from '#src/agents/repositories/agent-sessions/agent-sessions-table.ts';
import type { needsYouItemTable } from '#src/agents/repositories/needs-you-items/needs-you-items-table.ts';

type NeedsYouItemRow = InferSelectModel<typeof needsYouItemTable>;

const storedAgentIdSchema = z
  .string()
  .transform((agentId) => (agentId === parentAgentId ? null : agentId));

/** Items as `needs_you_item` rows, and back. */
export class NeedsYouItemRows {
  static agentId(agentId: string | null): string {
    return agentId ?? parentAgentId;
  }

  static item(row: NeedsYouItemRow): NeedsYouItem {
    return {
      id: row.id,
      reportedBy: row.reportedBy,
      sessionId: row.sessionId,
      agentId: storedAgentIdSchema.parse(row.agentId),
      kind: row.kind,
      question: row.question,
      openedAt: row.openedAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
    };
  }
}

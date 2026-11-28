import type { Ticket, TrackerSnapshot } from '@dash/integrations-core';

import type {
  ObjectiveRecords,
  TicketRecord,
} from '#src/objectives/contracts/objective-records.ts';

/** A tracker's provider-neutral snapshot in the shape of the objective tables. */
export class TrackerRecords {
  static from(snapshot: TrackerSnapshot): ObjectiveRecords {
    const initiativeIds = new Set(
      snapshot.initiatives.map(({ externalId }) => externalId),
    );
    const epics = snapshot.epics.filter(({ initiativeIds: placed }) =>
      placed.some((id) => initiativeIds.has(id)),
    );
    const epicIds = new Set(epics.map(({ externalId }) => externalId));
    const tickets = snapshot.tickets.flatMap(
      ({ epicId, position, ...ticket }) =>
        epicId === null || position === null || !epicIds.has(epicId)
          ? []
          : [{ ...ticket, epicId, position }],
    );
    const ticketIds = new Set(tickets.map(({ externalId }) => externalId));

    return {
      initiatives: snapshot.initiatives.map((initiative) => ({
        nodeId: initiative.externalId,
        title: initiative.title,
        url: initiative.url,
        state: initiative.state,
        priority: initiative.priority,
        dueDate: initiative.dueDate,
        lastActivityAt: initiative.lastActivityAt,
      })),
      epics: epics.map((epic) => ({
        nodeId: epic.externalId,
        title: epic.title,
        url: epic.url,
        state: epic.state,
        priority: epic.priority,
        dueDate: epic.dueDate,
        lastActivityAt: epic.lastActivityAt,
      })),
      placements: epics.flatMap((epic) =>
        epic.initiativeIds
          .filter((id) => initiativeIds.has(id))
          .map((initiativeNodeId) => ({
            initiativeNodeId,
            epicNodeId: epic.externalId,
          })),
      ),
      tickets: tickets.map((ticket) => TrackerRecords.ticket(ticket)),
      activity: snapshot.activity
        .filter(({ ticketId }) => ticketIds.has(ticketId))
        .map(({ ticketId, ...activity }) => ({
          ...activity,
          ticketNodeId: ticketId,
        })),
    };
  }

  private static ticket(
    ticket: Ticket & { epicId: string; position: number },
  ): TicketRecord {
    return {
      nodeId: ticket.externalId,
      epicNodeId: ticket.epicId,
      position: ticket.position,
      assignees: ticket.assignees,
      title: ticket.title,
      url: ticket.url,
      state: ticket.state,
      priority: ticket.priority,
      lastActivityAt: ticket.lastActivityAt,
    };
  }
}

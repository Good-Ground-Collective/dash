/** One outbox line to send, with its `seq` when the line has one. */
export interface OutboxEntry {
  heartbeat: unknown;
  seq: number | undefined;
}

/** The complete lines after a session's cursor, up to one batch's worth. */
export interface OutboxBatch {
  inode: number;
  /** Where reading began: the cursor's offset, or 0 for a file the cursor doesn't describe. */
  startOffset: number;
  /** Just past the last complete line read. A line still being written is left for the next read. */
  endOffset: number;
  entries: OutboxEntry[];
  /** Byte offsets of lines that are not JSON, which are skipped rather than sent. */
  unreadableOffsets: number[];
}

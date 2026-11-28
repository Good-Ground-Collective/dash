const hourMs = 60 * 60 * 1000;

/**
 * How long a merged pull request or a published release stays in the feed after it
 * happened. Home shows the last 24 hours; the second day keeps them through a read that
 * misses them, and they age out after it.
 */
export const recentActivityRetentionMs = 48 * hourMs;

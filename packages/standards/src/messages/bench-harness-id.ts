import { z } from 'zod';

/** The id a harness has in the daemon's allowlist, such as `claude-code`. Dash names a harness by this id and never by a command line. */
export const benchHarnessId = z
  .string()
  .max(64)
  .regex(/^[a-z][a-z0-9]*([.-][a-z0-9]+)*$/)
  .describe(
    "The harness's id in the daemon's allowlist: a lowercase dotted or dashed name.",
  );

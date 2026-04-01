import { Effect } from "effect";
import { wrapHandler } from "sveltekit-effect-runtime";

import type { RequestHandler } from "./$types";

export const GET: RequestHandler = wrapHandler(
  Effect.sync(() => {
    throw new Error("Intentional example failure from /api/error");
  }),
);

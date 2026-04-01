import { ExampleRequestContext } from "$lib/demo/services";
import { Effect } from "effect";
import { wrapServerLoad } from "sveltekit-effect-runtime";

import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = wrapServerLoad(
  Effect.gen(function* () {
    const requestContext = yield* ExampleRequestContext;

    return {
      serverShell: requestContext,
    };
  }),
);

import type { Handle, RequestEvent, ResolveOptions } from "@sveltejs/kit";

import { Effect, Layer, Context } from "effect";

type HandleInput = Parameters<Handle>[0];

const SvelteHandleParamsService = Context.Service<HandleInput>(
  "sveltekit-effect-runtime/SvelteHandleParams",
);

const currentSvelteHandleParams: Effect.Effect<
  SvelteHandleParamsValue,
  never,
  HandleInput
> = Effect.service(SvelteHandleParamsService).pipe(
  Effect.map(
    ({ event, resolve }): SvelteHandleParamsValue => ({
      event,
      resolve: (e, opts) =>
        Effect.promise(() => Promise.resolve(resolve(e, opts))),
    }),
  ),
);

export interface SvelteHandleParamsValue {
  readonly event: RequestEvent;
  readonly resolve: (
    event: RequestEvent,
    opts?: ResolveOptions,
  ) => Effect.Effect<Response>;
}

export const SvelteHandleParams = {
  Service: SvelteHandleParamsService,
  SvelteHandleParams: currentSvelteHandleParams,
  layer: (input: HandleInput): Layer.Layer<HandleInput> =>
    Layer.succeed(SvelteHandleParamsService, input),
} as const;

export { SvelteHandleParamsService };

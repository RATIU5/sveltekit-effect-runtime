import type { Handle } from "@sveltejs/kit";

import { Effect, Layer, ServiceMap } from "effect";

type HandleInput = Parameters<Handle>[0];

const SvelteHandleParamsService = ServiceMap.Service<HandleInput>(
  "sveltekit-effect-runtime/SvelteHandleParams",
);

const currentSvelteHandleParams = Effect.service(SvelteHandleParamsService);

export const SvelteHandleParams = {
  Service: SvelteHandleParamsService,
  SvelteHandleParams: currentSvelteHandleParams,
  layer: (input: HandleInput): Layer.Layer<HandleInput> =>
    Layer.succeed(SvelteHandleParamsService, input),
} as const;

export { SvelteHandleParamsService };

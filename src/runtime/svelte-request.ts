import type { RequestEvent } from "@sveltejs/kit";

import { Effect, Layer, ServiceMap } from "effect";
const SvelteRequestService = ServiceMap.Service<Request>(
  "sveltekit-effect-runtime/SvelteRequest",
);

const currentSvelteRequest = Effect.service(SvelteRequestService);

export const SvelteRequest = {
  Service: SvelteRequestService,
  SvelteRequest: currentSvelteRequest,
  fromEvent: (event: RequestEvent): Request => event.request,
  layer: (event: RequestEvent): Layer.Layer<Request> =>
    Layer.succeed(SvelteRequestService, event.request),
} as const;

export { SvelteRequestService };

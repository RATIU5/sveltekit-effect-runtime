import type { LoadEvent, RequestEvent } from "@sveltejs/kit";

import { Effect, ServiceMap } from "effect";

export const SvelteKitRequestEvent = ServiceMap.Service<RequestEvent>(
  "sveltekit-effect-runtime/SvelteKitRequestEvent",
);

export const currentRequestEvent = Effect.service(SvelteKitRequestEvent);

export const SvelteKitLoadEvent = ServiceMap.Service<LoadEvent>(
  "sveltekit-effect-runtime/SvelteKitLoadEvent",
);

export const currentLoadEvent = Effect.service(SvelteKitLoadEvent);

import type { LoadEvent, RequestEvent } from "@sveltejs/kit";

import { Effect, Context } from "effect";

export const SvelteKitRequestEvent = Context.Service<RequestEvent>(
  "sveltekit-effect-runtime/SvelteKitRequestEvent",
);

export const currentRequestEvent = Effect.service(SvelteKitRequestEvent);

export const SvelteKitLoadEvent = Context.Service<LoadEvent>(
  "sveltekit-effect-runtime/SvelteKitLoadEvent",
);

export const currentLoadEvent = Effect.service(SvelteKitLoadEvent);

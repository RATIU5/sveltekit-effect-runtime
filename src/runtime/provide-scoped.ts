import type { LoadEvent, RequestEvent } from "@sveltejs/kit";

import { Effect, Layer } from "effect";

import { getConfiguredLoadLayer, getConfiguredRequestLayer } from "./config.js";
import { SvelteKitLoadEvent, SvelteKitRequestEvent } from "./services.js";
import { SvelteRequest } from "./svelte-request.js";

const normalizeScopedLayer = (
  layer: Layer.Any,
): Layer.Layer<unknown, unknown, unknown> =>
  // `Layer.Any` is an existential layer type; this narrows it for composition.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  layer as unknown as Layer.Layer<unknown, unknown, unknown>;

export const provideRequestScoped = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  event: RequestEvent,
): Effect.Effect<A, unknown, unknown> => {
  const requestContextLayer = Layer.mergeAll(
    Layer.succeed(SvelteKitRequestEvent, event),
    SvelteRequest.layer(event),
  );

  const requestLayer = getConfiguredRequestLayer();
  if (requestLayer === undefined) {
    return effect.pipe(Effect.provide([requestContextLayer], { local: true }));
  }

  const requestScopedLayer = Layer.provide(requestContextLayer)(
    normalizeScopedLayer(requestLayer),
  );

  return effect.pipe(
    Effect.provide([requestContextLayer, requestScopedLayer], { local: true }),
  );
};

export const provideLoadScoped = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  event: LoadEvent,
): Effect.Effect<A, unknown, unknown> => {
  const loadContextLayer = Layer.succeed(SvelteKitLoadEvent, event);
  const loadLayer = getConfiguredLoadLayer();
  if (loadLayer === undefined) {
    return effect.pipe(Effect.provide([loadContextLayer], { local: true }));
  }

  const loadScopedLayer = Layer.provide(loadContextLayer)(
    normalizeScopedLayer(loadLayer),
  );

  return effect.pipe(
    Effect.provide([loadContextLayer, loadScopedLayer], { local: true }),
  );
};

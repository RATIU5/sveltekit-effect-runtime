import type { RequestHandler } from "@sveltejs/kit";
import * as Effect from "effect/Effect";

import {
  DemoStore,
  NeedsLogin,
  NotFound,
  RequestMeta,
  runtime,
} from "$lib";

export const GET: RequestHandler = runtime.handler(
  Effect.gen(function* () {
    const event = yield* runtime.CurrentRequestEvent;
    const request = yield* RequestMeta.asEffect();
    const store = yield* DemoStore.asEffect();
    const snapshot = yield* store.snapshot();

    if (event.url.searchParams.get("missing") === "true") {
      return yield* Effect.fail(
        new NotFound({
          message: "The runtime mapError option translated this domain failure.",
        }),
      );
    }

    if (event.url.searchParams.get("login") === "true") {
      return yield* Effect.fail(
        new NeedsLogin({
          next: event.url.pathname,
        }),
      );
    }

    return Response.json({
      endpoint: "/test",
      request,
      snapshot,
    });
  }),
);

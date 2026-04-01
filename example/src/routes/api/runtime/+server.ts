import { ExampleRequestContext } from "$lib/demo/services";
import { Effect } from "effect";
import {
  SvelteRequest,
  SvelteResponse,
  wrapHandler,
} from "sveltekit-effect-runtime";

import type { RequestHandler } from "./$types";

const createJsonResponse = () =>
  Effect.gen(function* () {
    const request = yield* SvelteRequest.SvelteRequest;
    const requestContext = yield* ExampleRequestContext;
    const url = new URL(request.url);

    return yield* SvelteResponse.unsafeJson({
      computedAt: new Date().toISOString(),
      format: url.searchParams.get("format") ?? "json",
      forwardedRequestId: requestContext.forwardedRequestId,
      method: request.method,
      path: requestContext.path,
      requestId: requestContext.requestId,
    });
  });

export const GET: RequestHandler = wrapHandler(
  Effect.gen(function* () {
    const request = yield* SvelteRequest.SvelteRequest;
    const requestContext = yield* ExampleRequestContext;
    const url = new URL(request.url);
    yield* Effect.logInfo("api-runtime:get", {
      format: url.searchParams.get("format") ?? "json",
      requestId: requestContext.requestId,
    });

    if (url.searchParams.get("format") === "text") {
      return yield* SvelteResponse.unsafeText(
        `${requestContext.method} ${requestContext.path} (${requestContext.requestId})`,
      );
    }

    return yield* createJsonResponse();
  }),
);

export const POST: RequestHandler = wrapHandler(
  Effect.gen(function* () {
    const request = yield* SvelteRequest.SvelteRequest;
    const body = yield* Effect.promise(() => request.text());
    yield* Effect.logInfo("api-runtime:post", {
      bodyLength: body.length,
    });

    return yield* SvelteResponse.unsafeText(
      `Echo from wrapHandler(): ${body || "empty body"}`,
    );
  }),
);

export const HEAD: RequestHandler = wrapHandler(
  Effect.gen(function* () {
    const requestContext = yield* ExampleRequestContext;

    return yield* SvelteResponse.unsafeResponse(
      new Response(undefined, {
        headers: {
          "x-demo-request-id": requestContext.requestId,
        },
      }),
    );
  }),
);

import { loadContextLayer, requestContextLayer } from "$lib/demo/services";
import { Effect } from "effect";
import {
  SvelteHandleParams,
  SvelteRequest,
  configureRuntime,
  wrapHandle,
  wrapHandleError,
  wrapHandleFetch,
  wrapHandleValidationError,
  wrapInit,
} from "sveltekit-effect-runtime";

export const init = wrapInit(() => {
  configureRuntime({
    loadLayer: loadContextLayer,
    logLevel: "Debug",
    requestLayer: requestContextLayer,
  });
});

export const handle = wrapHandle(
  Effect.gen(function* () {
    const { event, resolve } = yield* SvelteHandleParams.SvelteHandleParams;
    const request = yield* SvelteRequest.SvelteRequest;

    event.locals.requestId = crypto.randomUUID().slice(0, 8);
    event.locals.userAgent = request.headers.get("user-agent") ?? "unknown";
    yield* Effect.logInfo("handle", {
      method: request.method,
      path: event.url.pathname,
      requestId: event.locals.requestId,
    });

    return yield* resolve(event);
  }),
);

export const handleFetch = wrapHandleFetch(({ event, fetch, request }) => {
  const headers = new Headers(request.headers);
  headers.set("x-demo-request-id", event.locals.requestId);

  return Effect.gen(function* () {
    yield* Effect.logDebug("handleFetch", {
      path: new URL(request.url).pathname,
      requestId: event.locals.requestId,
    });

    return yield* Effect.promise(() =>
      fetch(
        new Request(request, {
          headers,
        }),
      ),
    );
  });
});

export const handleError = wrapHandleError(({ error, event, message }) =>
  Effect.gen(function* () {
    const detail = error instanceof Error ? error.message : String(error);
    yield* Effect.logError("handleError", {
      detail,
      path: event.url.pathname,
      requestId: event.locals.requestId,
    });

    return {
      detail,
      message: `${message} while handling ${event.url.pathname}`,
      requestId: event.locals.requestId,
    };
  }),
);

export const handleValidationError = wrapHandleValidationError(({ event }) =>
  Effect.succeed({
    detail: "Validation failed before an action completed.",
    message: `Validation error for ${event.url.pathname}`,
    requestId: event.locals.requestId,
  }),
);

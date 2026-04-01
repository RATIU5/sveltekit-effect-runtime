import {
  type ExampleRequestContext,
  ExampleLoadContext,
} from "$lib/demo/services";
import { Effect } from "effect";
import { currentLoadEvent, universalLoad } from "sveltekit-effect-runtime";

import type { LayoutLoad } from "./$types";

interface ApiSnapshot {
  computedAt: string;
  format: string;
  forwardedRequestId: string;
  method: string;
  path: string;
  requestId: string;
}

const createFallbackServerShell = (
  pathname: string,
): ExampleRequestContext => ({
  appName: "Effect Runtime Showcase",
  description: "Server shell data was not available.",
  forwardedRequestId: "none",
  method: "GET",
  path: pathname,
  requestId: "unavailable",
  userAgent: "unknown",
});

const isExampleRequestContext = (
  value: unknown,
): value is ExampleRequestContext =>
  typeof value === "object" &&
  value !== null &&
  "appName" in value &&
  "description" in value &&
  "forwardedRequestId" in value &&
  "method" in value &&
  "path" in value &&
  "requestId" in value &&
  "userAgent" in value;

export const load: LayoutLoad = universalLoad(({ fetch }) =>
  Effect.gen(function* () {
    const loadContext = yield* ExampleLoadContext;
    const event = yield* currentLoadEvent;
    const response = yield* Effect.promise(() =>
      fetch("/api/runtime?source=layout"),
    );
    const apiSnapshot = yield* Effect.promise<ApiSnapshot>(() =>
      response.json(),
    );
    const serverShell = isExampleRequestContext(event.data?.serverShell)
      ? event.data.serverShell
      : createFallbackServerShell(event.url.pathname);

    return {
      serverShell,
      universalShell: {
        ...loadContext,
        apiSnapshot,
        urlPath: event.url.pathname,
      },
    };
  }),
);

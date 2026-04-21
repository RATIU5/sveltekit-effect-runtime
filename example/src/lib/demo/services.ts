import { Effect, Layer, Context } from "effect";
import {
  currentLoadEvent,
  currentRequestEvent,
} from "sveltekit-effect-runtime";

export const APP_NAME = "Effect Runtime Showcase";
export const APP_DESCRIPTION =
  "A minimal SvelteKit app that exercises every runtime wrapper in this package.";

export interface ExampleRequestContext {
  appName: string;
  description: string;
  forwardedRequestId: string;
  method: string;
  path: string;
  requestId: string;
  userAgent: string;
}

export const ExampleRequestContext = Context.Service<ExampleRequestContext>(
  "example/ExampleRequestContext",
);

export const requestContextLayer = Layer.effect(ExampleRequestContext)(
  currentRequestEvent.pipe(
    Effect.map((event) => ({
      appName: APP_NAME,
      description: APP_DESCRIPTION,
      forwardedRequestId:
        event.request.headers.get("x-demo-request-id") ?? "none",
      method: event.request.method,
      path: event.url.pathname,
      requestId: event.locals.requestId ?? "pending",
      userAgent: event.locals.userAgent ?? "unknown",
    })),
  ),
);

export interface ExampleLoadContext {
  execution: "client" | "server";
  path: string;
  routeId: string | null;
}

export const ExampleLoadContext = Context.Service<ExampleLoadContext>(
  "example/ExampleLoadContext",
);

export const loadContextLayer = Layer.effect(ExampleLoadContext)(
  currentLoadEvent.pipe(
    Effect.map((event) => ({
      execution: Reflect.has(globalThis, "window") ? "client" : "server",
      path: event.url.pathname,
      routeId: event.route.id,
    })),
  ),
);

// oxlint-disable max-lines-per-function
// oxlint-disable max-statements
// oxlint-disable typescript/no-explicit-any
// oxlint-disable typescript/no-unsafe-type-assertion

import type { StandardSchemaV1 } from "@standard-schema/spec";

import {
  error as kitError,
  fail,
  redirect as kitRedirect,
  type RequestEvent,
  type ServerLoadEvent,
} from "@sveltejs/kit";
import { Context } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CurrentRequestEvent, CurrentServerLoadEvent } from "./events";
import { SvelteKitEffectRuntime } from "./runtime";

const appServer = vi.hoisted(() => {
  let currentRequestEvent: RequestEvent | undefined = undefined;
  return {
    get currentRequestEvent() {
      if (currentRequestEvent === undefined) {
        throw new Error("No current request event set");
      }
      return currentRequestEvent;
    },
    set currentRequestEvent(event: RequestEvent) {
      currentRequestEvent = event;
    },
    command: vi.fn((validateOrFn: unknown, maybeFn?: unknown) => ({
      __: {
        validateOrFn,
        fn: maybeFn ?? validateOrFn,
      },
    })),
    form: vi.fn((validateOrFn: unknown, maybeFn?: unknown) => ({
      __: {
        validateOrFn,
        fn: maybeFn ?? validateOrFn,
      },
    })),
    query: vi.fn((validateOrFn: unknown, maybeFn?: unknown) => ({
      __: {
        validateOrFn,
        fn: maybeFn ?? validateOrFn,
      },
    })),
  };
});

vi.mock("$app/server", () => ({
  command: appServer.command,
  form: appServer.form,
  getRequestEvent: () => appServer.currentRequestEvent,
  query: appServer.query,
}));

class AppValue extends Context.Service<AppValue, string>()("test/AppValue") {}

class RequestInfo extends Context.Service<
  RequestInfo,
  {
    readonly app: string;
    readonly path: string;
  }
>()("test/RequestInfo") {}

class LoadInfo extends Context.Service<
  LoadInfo,
  {
    readonly app: string;
    readonly routeId: string | null;
  }
>()("test/LoadInfo") {}

class RemoteInfo extends Context.Service<
  RemoteInfo,
  {
    readonly source: string;
    readonly path: string;
  }
>()("test/RemoteInfo") {}

type RemoteFormCallback = (
  input: { readonly name: string },
  issue: unknown,
) => Promise<{
  readonly input: { readonly name: string };
  readonly issue: unknown;
  readonly ok: true;
  readonly path: string;
}>;

type RemoteInputCallback<Input, Output> = (input: Input) => Promise<Output>;

const numberSchema = {
  "~standard": {
    vendor: "test",
    version: 1,
    validate: (value) => ({ value }),
  },
} as StandardSchemaV1<number, number>;

const thrown = (f: () => never): unknown => {
  try {
    f();
  } catch (error) {
    return error;
  }
  throw new Error("Expected function to throw");
};

const makeRequestEvent = (path: string): RequestEvent =>
  ({
    request: new Request(`https://example.test${path}`),
    url: new URL(`https://example.test${path}`),
  }) as RequestEvent;

const makeServerLoadEvent = (
  path: string,
  routeId: string | null,
): ServerLoadEvent =>
  ({
    request: new Request(`https://example.test${path}`),
    route: { id: routeId },
    url: new URL(`https://example.test${path}`),
  }) as ServerLoadEvent;

describe("SvelteKitEffectRuntime", () => {
  beforeEach(() => {
    appServer.command.mockReset();
    appServer.form.mockClear();
    appServer.query.mockReset();
  });

  it("provides current request and app services while building static request layers", async () => {
    const runtime = SvelteKitEffectRuntime.make({
      layer: Layer.succeed(AppValue)("app-value"),
      requestLayer: Layer.effect(RequestInfo)(
        Effect.gen(function* () {
          const event = yield* CurrentRequestEvent.asEffect();
          const app = yield* AppValue.asEffect();
          return {
            app,
            path: event.url.pathname,
          };
        }),
      ),
    });

    const GET = runtime.handler(
      Effect.gen(function* () {
        const info = yield* RequestInfo.asEffect();
        return Response.json(info);
      }),
    );

    const response = await GET(makeRequestEvent("/handler"));

    expect(await response.json()).toEqual({
      app: "app-value",
      path: "/handler",
    });
  });

  it("wraps the server handle hook with request context and resolve access", async () => {
    const runtime = SvelteKitEffectRuntime.make({
      layer: Layer.succeed(AppValue)("app-value"),
      requestLayer: Layer.effect(RequestInfo)(
        Effect.gen(function* () {
          const event = yield* CurrentRequestEvent.asEffect();
          const app = yield* AppValue.asEffect();
          return {
            app,
            path: event.url.pathname,
          };
        }),
      ),
    });

    const handle = runtime.handle(({ event, resolve }) =>
      Effect.gen(function* () {
        const info = yield* RequestInfo.asEffect();
        const response = yield* Effect.promise(() =>
          Promise.resolve(resolve(event)),
        );
        response.headers.set("x-app", info.app);
        response.headers.set("x-path", info.path);
        return response;
      }),
    );

    const response = await handle({
      event: makeRequestEvent("/hook"),
      resolve: () => new Response("resolved"),
    });

    expect(await response.text()).toBe("resolved");
    expect(response.headers.get("x-app")).toBe("app-value");
    expect(response.headers.get("x-path")).toBe("/hook");
  });

  it("lets handle hooks short-circuit without calling resolve", async () => {
    const runtime = SvelteKitEffectRuntime.make();
    const resolve = vi.fn(() => new Response("resolved"));
    const handle = runtime.handle(() => Effect.succeed(new Response("custom")));

    const response = await handle({
      event: makeRequestEvent("/custom"),
      resolve,
    });

    expect(await response.text()).toBe("custom");
    expect(resolve).not.toHaveBeenCalled();
  });

  it("provides current request and app services while resolving effect request-layer factories", async () => {
    const runtime = SvelteKitEffectRuntime.make({
      layer: Layer.succeed(AppValue)("app-value"),
      requestLayer: () =>
        Effect.gen(function* () {
          const event = yield* CurrentRequestEvent.asEffect();
          const app = yield* AppValue.asEffect();
          return Layer.succeed(RequestInfo)({
            app,
            path: event.url.pathname,
          });
        }),
    });

    const GET = runtime.handler(
      Effect.gen(function* () {
        const info = yield* RequestInfo.asEffect();
        return Response.json(info);
      }),
    );

    const response = await GET(makeRequestEvent("/factory"));

    expect(await response.json()).toEqual({
      app: "app-value",
      path: "/factory",
    });
  });

  it("provides current load event and app services while building load layers", async () => {
    const runtime = SvelteKitEffectRuntime.make({
      layer: Layer.succeed(AppValue)("app-value"),
      loadLayer: Layer.effect(LoadInfo)(
        Effect.gen(function* () {
          const event = yield* CurrentServerLoadEvent.asEffect();
          const app = yield* AppValue.asEffect();
          return {
            app,
            routeId: event.route.id,
          };
        }),
      ),
    });

    const load = runtime.load(
      Effect.gen(function* () {
        const info = yield* LoadInfo.asEffect();
        return info;
      }),
    );

    await expect(
      load(makeServerLoadEvent("/load", "/load-route")),
    ).resolves.toEqual({
      app: "app-value",
      routeId: "/load-route",
    });
  });

  it("passes SvelteKit remote form payloads into effect callbacks", async () => {
    const runtime = SvelteKitEffectRuntime.make();
    const event = makeRequestEvent("/remote-form");
    const issue = vi.fn();
    appServer.currentRequestEvent = event;

    runtime.form<{ readonly name: string }, { readonly ok: true }, never>(
      "unchecked",
      (input, invalidField) =>
        Effect.gen(function* () {
          const current = yield* CurrentRequestEvent.asEffect();
          return {
            ok: true as const,
            input,
            issue: invalidField,
            path: current.url.pathname,
          };
        }),
    );

    const remoteCallback = appServer.form.mock.calls[0]?.[1] as
      | RemoteFormCallback
      | undefined;

    await expect(remoteCallback?.({ name: "Ada" }, issue)).resolves.toEqual({
      input: { name: "Ada" },
      issue,
      ok: true,
      path: "/remote-form",
    });
  });

  it("finalizes request layers after handler completion", async () => {
    let acquired = 0;
    let released = 0;
    const runtime = SvelteKitEffectRuntime.make({
      requestLayer: Layer.effect(RequestInfo)(
        Effect.acquireRelease(
          Effect.sync(() => {
            acquired += 1;
            return {
              app: "request",
              path: "/scoped",
            };
          }),
          () =>
            Effect.sync(() => {
              released += 1;
            }),
        ),
      ),
    });

    const GET = runtime.handler(
      Effect.gen(function* () {
        const info = yield* RequestInfo.asEffect();
        return Response.json(info);
      }),
    );

    const response = await GET(makeRequestEvent("/scoped"));

    expect(await response.json()).toEqual({
      app: "request",
      path: "/scoped",
    });
    expect(acquired).toBe(1);
    expect(released).toBe(1);
  });

  it("returns action failures from failed action effects", async () => {
    const runtime = SvelteKitEffectRuntime.make();
    const actions = runtime.actions({
      default: Effect.fail(fail(400, { message: "Invalid input" })),
    });

    await expect(actions.default(makeRequestEvent("/action"))).resolves.toEqual(
      {
        status: 400,
        data: { message: "Invalid input" },
      },
    );
  });

  it("maps domain failures to SvelteKit HTTP errors", async () => {
    const httpError = thrown(() => kitError(404, { message: "Not found" }));
    const runtime = SvelteKitEffectRuntime.make({
      mapError: (failure) => (failure === "missing" ? httpError : failure),
    });

    const GET = runtime.handler(Effect.fail("missing"));

    await expect(GET(makeRequestEvent("/missing"))).rejects.toMatchObject({
      status: 404,
    });
  });

  it("preserves SvelteKit redirects failed through Effect", async () => {
    const redirect = thrown(() => kitRedirect(303, "/login"));
    const runtime = SvelteKitEffectRuntime.make();
    const GET = runtime.handler(Effect.fail(redirect));

    await expect(GET(makeRequestEvent("/private"))).rejects.toMatchObject({
      location: "/login",
      status: 303,
    });
  });

  it("passes remote query input through with request context and request layer", async () => {
    const runtime = SvelteKitEffectRuntime.make({
      layer: Layer.succeed(AppValue)("app-value"),
      requestLayer: Layer.effect(RequestInfo)(
        Effect.gen(function* () {
          const event = yield* CurrentRequestEvent.asEffect();
          const app = yield* AppValue.asEffect();
          return {
            app,
            path: event.url.pathname,
          };
        }),
      ),
    });
    appServer.currentRequestEvent = makeRequestEvent("/remote-query");

    runtime.query(numberSchema, (id) =>
      Effect.gen(function* () {
        const info = yield* RequestInfo.asEffect();
        return {
          id,
          info,
        };
      }),
    );

    const remoteCallback = appServer.query.mock.calls[0]?.[1] as
      | RemoteInputCallback<
          number,
          {
            readonly id: number;
            readonly info: {
              readonly app: string;
              readonly path: string;
            };
          }
        >
      | undefined;

    await expect(remoteCallback?.(42)).resolves.toEqual({
      id: 42,
      info: {
        app: "app-value",
        path: "/remote-query",
      },
    });
  });

  it("uses the remote layer for remote functions when supplied", async () => {
    const runtime = SvelteKitEffectRuntime.make({
      requestLayer: Layer.succeed(RequestInfo)({
        app: "request",
        path: "/wrong",
      }),
      remoteLayer: Layer.effect(RemoteInfo)(
        Effect.gen(function* () {
          const event = yield* CurrentRequestEvent.asEffect();
          return {
            source: "remote",
            path: event.url.pathname,
          };
        }),
      ),
    });
    appServer.currentRequestEvent = makeRequestEvent("/remote-layer");

    runtime.query(
      Effect.gen(function* () {
        return yield* RemoteInfo.asEffect();
      }),
    );

    const remoteCallback = appServer.query.mock.calls[0]?.[0] as
      | (() => Promise<{
          readonly source: string;
          readonly path: string;
        }>)
      | undefined;

    await expect(remoteCallback?.()).resolves.toEqual({
      path: "/remote-layer",
      source: "remote",
    });
  });

  it("passes remote command input through with request context and request layer", async () => {
    const runtime = SvelteKitEffectRuntime.make({
      requestLayer: Layer.effect(RequestInfo)(
        Effect.gen(function* () {
          const event = yield* CurrentRequestEvent.asEffect();
          return {
            app: "command",
            path: event.url.pathname,
          };
        }),
      ),
    });
    appServer.currentRequestEvent = makeRequestEvent("/remote-command");

    runtime.command(numberSchema, (id) =>
      Effect.gen(function* () {
        const info = yield* RequestInfo.asEffect();
        return {
          id,
          info,
        };
      }),
    );

    const remoteCallback = appServer.command.mock.calls[0]?.[1] as
      | RemoteInputCallback<
          number,
          {
            readonly id: number;
            readonly info: {
              readonly app: string;
              readonly path: string;
            };
          }
        >
      | undefined;

    await expect(remoteCallback?.(7)).resolves.toEqual({
      id: 7,
      info: {
        app: "command",
        path: "/remote-command",
      },
    });
  });
});

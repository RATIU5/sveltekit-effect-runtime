import {
  fail,
  type Cookies,
  type RequestEvent,
  type ServerLoadEvent,
} from "@sveltejs/kit";
import { Effect, Layer, Context } from "effect";
import { describe, expect, it, beforeEach } from "vitest";

import {
  configureRuntime,
  currentRequestEvent,
  resetRuntimeForTesting,
  SvelteRequest,
  SvelteResponse,
  wrapActions,
  wrapHandler,
  wrapServerLoad,
} from "./index.js";

const createCookies = (): Cookies => ({
  get: () => undefined,
  getAll: () => [],
  set: () => {},
  delete: () => {},
  serialize: () => "",
});

const createRequestEvent = (pathname = "/test"): RequestEvent => {
  const event: RequestEvent = {
    url: new URL(`https://example.com${pathname}`),
    request: new Request(`https://example.com${pathname}`),
    params: {},
    locals: {},
    platform: undefined,
    route: { id: pathname },
    cookies: createCookies(),
    fetch,
    getClientAddress: () => "127.0.0.1",
    isDataRequest: false,
    isRemoteRequest: false,
    isSubRequest: false,
    setHeaders: () => {},
    tracing: {
      enabled: false,
      root: undefined,
      current: undefined,
    },
  };

  return event;
};

const createServerLoadEvent = (pathname = "/load"): ServerLoadEvent => {
  const event: ServerLoadEvent = {
    ...createRequestEvent(pathname),
    isRemoteRequest: false,
    depends: () => {},
    parent: () => Promise.resolve({}),
    untrack: <T>(fn: () => T): T => fn(),
  };

  return event;
};

const TestPath = Context.Service<string>("sveltekit-effect-runtime/TestPath");

beforeEach(async () => {
  await resetRuntimeForTesting();
});

describe("runtime handler helpers", () => {
  it("wraps a raw Effect as a request handler", async () => {
    const wrapped = wrapHandler(
      currentRequestEvent.pipe(
        Effect.map(
          (event) => new Response(event.url.pathname, { status: 201 }),
        ),
      ),
    );

    const response = await wrapped(createRequestEvent("/api/ping"));

    expect(response.status).toBe(201);
    await expect(response.text()).resolves.toBe("/api/ping");
  });

  it("passes plain handlers through", async () => {
    const wrapped = wrapHandler(() => new Response("plain"));

    const response = await wrapped(createRequestEvent());

    await expect(response.text()).resolves.toBe("plain");
  });

  it("awaits handlers that resolve to Effects", async () => {
    const wrapped = wrapHandler(() =>
      Promise.resolve(Effect.succeed(new Response("resolved-effect"))),
    );

    const response = await wrapped(createRequestEvent());

    await expect(response.text()).resolves.toBe("resolved-effect");
  });
});

describe("runtime request services", () => {
  it("provides the SvelteRequest service for request effects", async () => {
    const wrapped = wrapHandler(
      Effect.gen(function* () {
        const request = yield* SvelteRequest.SvelteRequest;
        return yield* SvelteResponse.unsafeText(request.method);
      }),
    );

    const response = await wrapped(createRequestEvent());

    await expect(response.text()).resolves.toBe("GET");
  });
});

describe("runtime request layer composition", () => {
  it("provides a configured requestLayer locally per request", async () => {
    configureRuntime({
      requestLayer: Layer.effect(TestPath)(
        currentRequestEvent.pipe(Effect.map((event) => event.url.pathname)),
      ),
    });

    const wrapped = wrapHandler(
      Effect.gen(function* () {
        const path = yield* TestPath;
        return yield* SvelteResponse.unsafeJson({ path });
      }),
    );

    const response = await wrapped(createRequestEvent("/layered"));

    await expect(response.json()).resolves.toEqual({ path: "/layered" });
  });
});

describe("runtime server load helpers", () => {
  beforeEach(async () => {
    await resetRuntimeForTesting();
  });

  it("wraps raw Effect server loads", async () => {
    const wrapped = wrapServerLoad(
      currentRequestEvent.pipe(
        Effect.map((event) => ({
          path: event.url.pathname,
        })),
      ),
    );

    await expect(wrapped(createServerLoadEvent("/dashboard"))).resolves.toEqual(
      { path: "/dashboard" },
    );
  });

  it("awaits server loads that resolve to Effects", async () => {
    const wrapped = wrapServerLoad(() =>
      Promise.resolve(
        currentRequestEvent.pipe(
          Effect.map((event) => ({
            path: event.url.pathname,
          })),
        ),
      ),
    );

    await expect(
      wrapped(createServerLoadEvent("/async-load")),
    ).resolves.toEqual({ path: "/async-load" });
  });
});

describe("runtime action helpers", () => {
  beforeEach(async () => {
    await resetRuntimeForTesting();
  });

  it("maps ActionFailure errors back into action results", async () => {
    const wrapped = wrapActions({
      default: Effect.fail(fail(400, { message: "bad input" })),
    });
    expect(wrapped.default).toBeDefined();
    if (wrapped.default === undefined) {
      throw new Error("Missing default action");
    }

    const result = await wrapped.default(createRequestEvent("/form"));

    expect(result).toMatchObject({
      status: 400,
      data: { message: "bad input" },
    });
  });

  it("preserves exact action keys", () => {
    const wrapped = wrapActions({
      save: Effect.void,
    });

    expect(wrapped.save).toBeDefined();
  });
});

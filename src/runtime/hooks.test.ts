import type { RequestEvent } from "@sveltejs/kit";

import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import {
  configureRuntime,
  currentRequestEvent,
  resetRuntimeForTesting,
  wrapHandle,
  wrapHandleError,
  wrapHandleFetch,
  wrapHandleValidationError,
  wrapInit,
} from "./index";
import { getOrCreateRuntime } from "./managed-runtime";

const createRequestEvent = (pathname = "/test"): RequestEvent => ({
  url: new URL(`https://example.com${pathname}`),
  request: new Request(`https://example.com${pathname}`),
  params: {},
  locals: {},
  platform: undefined,
  route: { id: pathname },
  cookies: {
    get: () => undefined,
    getAll: () => [],
    set: () => {},
    delete: () => {},
    serialize: () => "",
  },
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
});

beforeEach(async () => {
  await resetRuntimeForTesting();
});

describe("runtime hook helpers", () => {
  it("allows init to configure the runtime before first creation", async () => {
    const wrapped = wrapInit(() => {
      configureRuntime({ layer: undefined });
    });

    await expect(wrapped()).resolves.toBeUndefined();
    expect(() => {
      configureRuntime({ layer: undefined });
    }).not.toThrow();

    getOrCreateRuntime();
    expect(() => {
      configureRuntime({ layer: undefined });
    }).toThrow(/before the runtime is first used/);
  });

  it("boots the runtime through init", async () => {
    const wrapped = wrapInit(Effect.void);

    await expect(wrapped()).resolves.toBeUndefined();
    expect(getOrCreateRuntime()).toBeDefined();
  });

  it("supports handle functions that return Effects", async () => {
    const wrapped = wrapHandle(({ event }) =>
      Effect.succeed(new Response(`handled:${event.url.pathname}`)),
    );

    const response = await wrapped({
      event: createRequestEvent("/hook"),
      resolve: () => new Response("fallback"),
    });

    await expect(response.text()).resolves.toBe("handled:/hook");
  });
});

describe("runtime handleFetch helpers", () => {
  it("supports handleFetch functions that return Effects", async () => {
    const wrapped = wrapHandleFetch(
      currentRequestEvent.pipe(
        Effect.map((event) => new Response(`fetch:${event.url.pathname}`)),
      ),
    );

    const response = await wrapped({
      event: createRequestEvent("/fetch"),
      request: new Request("https://example.com/fetch"),
      fetch,
    });

    await expect(response.text()).resolves.toBe("fetch:/fetch");
  });
});

describe("runtime handleError helpers", () => {
  it("supports handleError functions that return Effects", async () => {
    const wrapped = wrapHandleError(
      currentRequestEvent.pipe(
        Effect.map((event) => ({
          message: `error:${event.url.pathname}`,
        })),
      ),
    );

    await expect(
      wrapped({
        error: new Error("boom"),
        event: createRequestEvent("/error"),
        status: 500,
        message: "boom",
      }),
    ).resolves.toEqual({
      message: "error:/error",
    });
  });
});

describe("runtime handleValidationError helpers", () => {
  it("supports handleValidationError functions that return Effects", async () => {
    const wrapped = wrapHandleValidationError(
      currentRequestEvent.pipe(
        Effect.map((event) => ({
          message: `invalid:${event.url.pathname}`,
        })),
      ),
    );

    await expect(
      wrapped({
        issues: [],
        event: createRequestEvent("/validation"),
      }),
    ).resolves.toEqual({
      message: "invalid:/validation",
    });
  });
});

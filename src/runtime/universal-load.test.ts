import type { LoadEvent } from "@sveltejs/kit";

import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import {
  configureRuntime,
  currentLoadEvent,
  resetRuntimeForTesting,
  universalLoad,
} from "./index";

const createLoadEvent = (pathname = "/universal"): LoadEvent => ({
  data: {},
  depends: () => {},
  fetch,
  params: {},
  parent: () => Promise.resolve({}),
  route: { id: pathname },
  setHeaders: () => {},
  tracing: {
    current: undefined,
    enabled: false,
    root: undefined,
  },
  untrack: <T>(fn: () => T): T => fn(),
  url: new URL(`https://example.com${pathname}`),
});

const withMockBrowser = async <T>(run: () => Promise<T>): Promise<T> => {
  const hadWindow = Reflect.has(globalThis, "window");
  const originalWindow: unknown = Reflect.get(globalThis, "window");

  Reflect.set(globalThis, "window", {});

  try {
    return await run();
  } finally {
    if (hadWindow) {
      Reflect.set(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
};

beforeEach(async () => {
  await resetRuntimeForTesting();
});

describe("universal load helpers", () => {
  it("wraps raw Effect universal loads", async () => {
    const wrapped = universalLoad(
      currentLoadEvent.pipe(
        Effect.map((event) => ({
          path: event.url.pathname,
        })),
      ),
    );

    await expect(wrapped(createLoadEvent("/client-like"))).resolves.toEqual({
      path: "/client-like",
    });
  });

  it("awaits universal loads that resolve to Effects", async () => {
    const wrapped = universalLoad(() =>
      Promise.resolve(
        currentLoadEvent.pipe(
          Effect.map((event) => ({
            path: event.url.pathname,
          })),
        ),
      ),
    );

    await expect(wrapped(createLoadEvent("/async-universal"))).resolves.toEqual(
      { path: "/async-universal" },
    );
  });
});

describe("browser universal loads", () => {
  it("do not create or lock the managed runtime in the browser", async () => {
    await withMockBrowser(async () => {
      const wrapped = universalLoad(
        currentLoadEvent.pipe(
          Effect.map((event) => ({
            path: event.url.pathname,
          })),
        ),
      );

      await expect(wrapped(createLoadEvent("/client-like"))).resolves.toEqual({
        path: "/client-like",
      });

      expect(() => {
        configureRuntime({ layer: undefined });
      }).not.toThrow();
    });
  });
});

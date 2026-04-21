import { Effect, Layer, Context, type Layer as LayerType } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import {
  configureRuntime,
  resetRuntimeForTesting,
  wrapHandler,
} from "./index.js";
import {
  disposeRuntime,
  getOrCreateRuntime,
  runWithRuntime,
} from "./managed-runtime.js";

const DisposalProbe = Context.Service<string>(
  "sveltekit-effect-runtime/DisposalProbe",
);

const asRuntimeLayer = (layer: Layer.Any): LayerType.Layer<unknown, unknown> =>
  // The runtime accepts arbitrary provided services and treats them opaquely.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  layer as unknown as LayerType.Layer<unknown, unknown>;

const createDisposalProbeLayer = (
  onFinalize?: () => Effect.Effect<void>,
): LayerType.Layer<unknown, unknown> =>
  asRuntimeLayer(
    Layer.effect(DisposalProbe)(
      Effect.gen(function* () {
        yield* Effect.addFinalizer(() => onFinalize?.() ?? Effect.void);
        return "ready";
      }),
    ),
  );

const createRequestEvent = (pathname: string) => ({
  cookies: {
    delete: () => {},
    get: () => undefined,
    getAll: () => [],
    serialize: () => "",
    set: () => {},
  },
  fetch,
  getClientAddress: () => "127.0.0.1",
  isDataRequest: false,
  isRemoteRequest: false,
  isSubRequest: false,
  locals: {},
  params: {},
  platform: undefined,
  request: new Request(`https://example.com${pathname}`),
  route: { id: pathname },
  setHeaders: () => {},
  tracing: { current: undefined, enabled: false, root: undefined },
  url: new URL(`https://example.com${pathname}`),
});

const useDisposalProbe = (onAcquire?: () => void) =>
  Effect.gen(function* () {
    onAcquire?.();
    return yield* DisposalProbe;
  });

beforeEach(async () => {
  await resetRuntimeForTesting();
});

describe("managed runtime configuration", () => {
  it("throws if configureRuntime is called after first use", () => {
    wrapHandler(Effect.succeed(new Response("ok")));
    getOrCreateRuntime();

    expect(() => {
      configureRuntime({ layer: undefined });
    }).toThrow(/before the runtime is first used/);
  });
});

describe("managed runtime reuse", () => {
  it("reuses the managed runtime across requests", async () => {
    const wrapped = wrapHandler(Effect.succeed(new Response("ok")));
    const firstRuntime = getOrCreateRuntime();

    await wrapped(createRequestEvent("/first"));
    await wrapped(createRequestEvent("/second"));

    expect(getOrCreateRuntime()).toBe(firstRuntime);
  });
});

describe("managed runtime disposal", () => {
  it("waits for runtime disposal before creating a replacement", async () => {
    const events: Array<string> = [];

    configureRuntime({
      layer: createDisposalProbeLayer(() =>
        Effect.gen(function* () {
          events.push("dispose-start");
          yield* Effect.sleep(10);
          events.push("dispose-end");
        }),
      ),
    });

    await runWithRuntime(
      useDisposalProbe(() => {
        events.push("acquire");
      }),
    );

    const disposePromise = disposeRuntime();
    const rerunPromise = runWithRuntime(
      useDisposalProbe(() => {
        events.push("acquire");
      }),
    );

    await Promise.all([disposePromise, rerunPromise]);

    expect(events).toEqual([
      "acquire",
      "dispose-start",
      "dispose-end",
      "acquire",
    ]);
  });
});

describe("managed runtime test resets", () => {
  it("keeps configuration locked until test disposal finishes", async () => {
    configureRuntime({
      layer: createDisposalProbeLayer(() => Effect.sleep(10)),
    });

    await runWithRuntime(useDisposalProbe());

    const resetPromise = resetRuntimeForTesting();

    expect(() => {
      configureRuntime({ layer: undefined });
    }).toThrow(/before the runtime is first used/);

    await resetPromise;

    expect(() => {
      configureRuntime({ layer: undefined });
    }).not.toThrow();
  });
});

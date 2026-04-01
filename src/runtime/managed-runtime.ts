import { type Effect, Layer, Logger, ManagedRuntime, References } from "effect";

import {
  getConfiguredLogLevel,
  getConfiguredRuntimeLayer,
  lockRuntimeConfiguration,
  resetConfiguredRuntime,
} from "./config";

let runtime: ManagedRuntime.ManagedRuntime<unknown, unknown> | undefined =
  undefined;
let runtimeDisposal: Promise<void> | undefined = undefined;

const getLoggingLayer = (): Layer.Layer<never> | undefined => {
  const configuredLogLevel = getConfiguredLogLevel();
  if (configuredLogLevel === undefined) {
    return undefined;
  }

  return Layer.mergeAll(
    Logger.layer([Logger.consolePretty()]),
    Layer.succeed(References.MinimumLogLevel, configuredLogLevel),
  );
};

const getBaseLayer = () => {
  const configuredLayer = getConfiguredRuntimeLayer() ?? Layer.empty;
  const loggingLayer = getLoggingLayer();

  if (loggingLayer === undefined) {
    return configuredLayer;
  }

  return Layer.mergeAll(configuredLayer, loggingLayer);
};

const waitForRuntimeDisposal = async (): Promise<void> => {
  if (runtimeDisposal !== undefined) {
    await runtimeDisposal;
  }
};

export const getOrCreateRuntime = (): ManagedRuntime.ManagedRuntime<
  unknown,
  unknown
> => {
  if (runtimeDisposal !== undefined) {
    throw new Error(
      "Managed runtime is currently disposing; wait for disposal to finish.",
    );
  }

  if (runtime === undefined) {
    lockRuntimeConfiguration();
    // `ManagedRuntime.make` preserves the layer's provided services; this
    // Adapter only exposes the runtime through already-provided effects.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    runtime = ManagedRuntime.make(
      getBaseLayer(),
    ) as ManagedRuntime.ManagedRuntime<unknown, unknown>;
  }

  const currentRuntime = runtime;
  if (currentRuntime === undefined) {
    throw new Error("Managed runtime creation failed unexpectedly.");
  }

  return currentRuntime;
};

export const runWithRuntime = <A, E>(
  effect: Effect.Effect<A, E, unknown>,
): Promise<A> =>
  waitForRuntimeDisposal().then(() => getOrCreateRuntime().runPromise(effect));

export const disposeRuntime = async (): Promise<void> => {
  if (runtimeDisposal !== undefined) {
    await runtimeDisposal;
    return;
  }

  if (runtime === undefined) {
    return;
  }

  const currentRuntime = runtime;
  const disposal = currentRuntime.dispose().finally(() => {
    if (runtimeDisposal === disposal) {
      runtime = undefined;
      runtimeDisposal = undefined;
    }
  });

  runtimeDisposal = disposal;

  await disposal;
};

export const resetRuntimeForTesting = async (): Promise<void> => {
  await disposeRuntime();
  resetConfiguredRuntime();
};

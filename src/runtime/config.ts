import type { Layer, LogLevel } from "effect";

// oxlint-disable-next-line init-declarations
let configuredLayer: GlobalRuntimeLayer | undefined;
let configuredRequestLayer: ScopedRuntimeLayer | undefined = undefined;
let configuredLoadLayer: ScopedRuntimeLayer | undefined = undefined;
let configuredLogLevel: LogLevel.LogLevel | undefined = undefined;
let runtimeConfigurationLocked = false;

export type GlobalRuntimeLayer = Layer.Layer<unknown, unknown>;

export type ScopedRuntimeLayer = Layer.Any;

export const getConfiguredRuntimeLayer = (): GlobalRuntimeLayer | undefined =>
  configuredLayer;

export const getConfiguredRequestLayer = (): ScopedRuntimeLayer | undefined =>
  configuredRequestLayer;

export const getConfiguredLoadLayer = (): ScopedRuntimeLayer | undefined =>
  configuredLoadLayer;

export const getConfiguredLogLevel = (): LogLevel.LogLevel | undefined =>
  configuredLogLevel;

export const configureRuntime = (options: {
  layer?: GlobalRuntimeLayer | undefined;
  requestLayer?: ScopedRuntimeLayer | undefined;
  loadLayer?: ScopedRuntimeLayer | undefined;
  logLevel?: LogLevel.LogLevel | undefined;
}): void => {
  if (runtimeConfigurationLocked) {
    throw new Error(
      "configureRuntime() must be called before the runtime is first used.",
    );
  }

  configuredLayer = options.layer;
  configuredRequestLayer = options.requestLayer;
  configuredLoadLayer = options.loadLayer;
  configuredLogLevel = options.logLevel;
};

export const lockRuntimeConfiguration = (): void => {
  runtimeConfigurationLocked = true;
};

export const resetConfiguredRuntime = (): void => {
  configuredLayer = undefined;
  configuredRequestLayer = undefined;
  configuredLoadLayer = undefined;
  configuredLogLevel = undefined;
  runtimeConfigurationLocked = false;
};

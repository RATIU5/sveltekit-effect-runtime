import type { Load, LoadEvent } from "@sveltejs/kit";

// oxlint-disable require-await
// oxlint-disable typescript/no-explicit-any
import { Effect } from "effect";

import { runWithRuntime } from "./managed-runtime.js";
import { provideLoadScoped } from "./provide-scoped.js";

type LoadResult = Record<string, any> | void;

type EffectCandidate<A> = A | Effect.Effect<A, unknown, unknown>;

type AnyLoadEvent = Parameters<Load>[0];

const isBrowser = (): boolean => Reflect.has(globalThis, "window");

const runLoadEffectDirectly = <A>(
  effect: Effect.Effect<A, unknown, unknown>,
): Promise<A> =>
  // The client path only has load-scoped services available at runtime.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  Effect.runPromise(effect as Effect.Effect<A, unknown>);

type UniversalLoadSource<
  Event extends AnyLoadEvent = AnyLoadEvent,
  OutputData extends LoadResult = LoadResult,
> =
  | ((
      event: Event,
    ) => EffectCandidate<OutputData> | Promise<EffectCandidate<OutputData>>)
  | Effect.Effect<OutputData, unknown, unknown>;

const runCandidate = async <A>(
  candidate: EffectCandidate<A>,
  event: LoadEvent,
): Promise<A> => {
  if (!Effect.isEffect(candidate)) {
    return candidate;
  }

  if (isBrowser()) {
    return runLoadEffectDirectly(provideLoadScoped(candidate, event));
  }

  return runWithRuntime(provideLoadScoped(candidate, event));
};

export const universalLoad =
  <Event extends AnyLoadEvent, OutputData extends LoadResult = LoadResult>(
    value: UniversalLoadSource<Event, OutputData>,
  ) =>
  async (event: Event) => {
    const candidate = typeof value === "function" ? await value(event) : value;

    return runCandidate(candidate, event);
  };

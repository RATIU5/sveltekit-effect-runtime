import type { ServerLoad, ServerLoadEvent } from "@sveltejs/kit";

// oxlint-disable require-await
// oxlint-disable typescript/no-explicit-any
import { Effect } from "effect";

import { runWithRuntime } from "./managed-runtime.js";
import { provideRequestScoped } from "./provide-scoped.js";

type LoadResult = Record<string, any> | void;

type EffectCandidate<A> = A | Effect.Effect<A, unknown, unknown>;

type AnyServerLoadEvent = Parameters<ServerLoad>[0];

type LoadSource<
  Event extends AnyServerLoadEvent = AnyServerLoadEvent,
  OutputData extends LoadResult = LoadResult,
> =
  | ((
      event: Event,
    ) => EffectCandidate<OutputData> | Promise<EffectCandidate<OutputData>>)
  | Effect.Effect<OutputData, unknown, unknown>;

const runCandidate = async <A>(
  candidate: EffectCandidate<A>,
  event: ServerLoadEvent,
): Promise<A> => {
  if (!Effect.isEffect(candidate)) {
    return candidate;
  }

  return runWithRuntime(provideRequestScoped(candidate, event));
};

export const wrapServerLoad =
  <
    Event extends AnyServerLoadEvent,
    OutputData extends LoadResult = LoadResult,
  >(
    value: LoadSource<Event, OutputData>,
  ) =>
  async (event: Event) => {
    const candidate = typeof value === "function" ? await value(event) : value;

    return runCandidate(candidate, event);
  };

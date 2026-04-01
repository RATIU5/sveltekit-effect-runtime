import type { HandleFetch } from "@sveltejs/kit";

import { Effect } from "effect";

import { runWithRuntime } from "./managed-runtime";
import { provideRequestScoped } from "./provide-scoped";

type EffectCandidate<A> = A | Effect.Effect<A, unknown, unknown>;

type HandleFetchInput = Parameters<HandleFetch>[0];

type HandleFetchSource =
  | ((
      input: HandleFetchInput,
    ) => EffectCandidate<Response> | Promise<EffectCandidate<Response>>)
  | Effect.Effect<Response, unknown, unknown>;

const runCandidate = <A>(
  candidate: EffectCandidate<A>,
  input: HandleFetchInput,
): Promise<A> => {
  if (!Effect.isEffect(candidate)) {
    return Promise.resolve(candidate);
  }

  return runWithRuntime(provideRequestScoped(candidate, input.event));
};

export const wrapHandleFetch =
  (value: HandleFetchSource): HandleFetch =>
  async (input) => {
    const candidate = typeof value === "function" ? await value(input) : value;

    return runCandidate(candidate, input);
  };

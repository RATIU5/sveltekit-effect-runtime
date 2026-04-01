import type { HandleServerError } from "@sveltejs/kit";

import { Effect } from "effect";

import { runWithRuntime } from "./managed-runtime.js";
import { provideRequestScoped } from "./provide-scoped.js";

type HandleErrorResult = App.Error | void;

type EffectCandidate<A> = A | Effect.Effect<A, unknown, unknown>;

type HandleErrorInput = Parameters<HandleServerError>[0];

type HandleErrorSource =
  | ((
      input: HandleErrorInput,
    ) =>
      | EffectCandidate<HandleErrorResult>
      | Promise<EffectCandidate<HandleErrorResult>>)
  | Effect.Effect<HandleErrorResult, unknown, unknown>;

const runCandidate = (
  candidate: EffectCandidate<HandleErrorResult>,
  input: HandleErrorInput,
): Promise<HandleErrorResult> => {
  if (!Effect.isEffect(candidate)) {
    return Promise.resolve(candidate);
  }

  return runWithRuntime(provideRequestScoped(candidate, input.event));
};

export const wrapHandleError =
  (value: HandleErrorSource): HandleServerError =>
  async (input) => {
    const candidate = typeof value === "function" ? await value(input) : value;

    return runCandidate(candidate, input);
  };

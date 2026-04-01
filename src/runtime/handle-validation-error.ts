import type { HandleValidationError } from "@sveltejs/kit";

import { Effect } from "effect";

import { runWithRuntime } from "./managed-runtime";
import { provideRequestScoped } from "./provide-scoped";

type EffectCandidate<A> = A | Effect.Effect<A, unknown, unknown>;

type HandleValidationErrorInput = Parameters<HandleValidationError>[0];

type HandleValidationErrorSource =
  | ((
      input: HandleValidationErrorInput,
    ) => EffectCandidate<App.Error> | Promise<EffectCandidate<App.Error>>)
  | Effect.Effect<App.Error, unknown, unknown>;

const runCandidate = (
  candidate: EffectCandidate<App.Error>,
  input: HandleValidationErrorInput,
): Promise<App.Error> => {
  if (!Effect.isEffect(candidate)) {
    return Promise.resolve(candidate);
  }

  return runWithRuntime(provideRequestScoped(candidate, input.event));
};

export const wrapHandleValidationError =
  (value: HandleValidationErrorSource): HandleValidationError =>
  async (input) => {
    const candidate = typeof value === "function" ? await value(input) : value;

    return runCandidate(candidate, input);
  };

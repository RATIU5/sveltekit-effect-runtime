import type { Handle } from "@sveltejs/kit";

import { Effect } from "effect";

import { runWithRuntime } from "./managed-runtime";
import { provideRequestScoped } from "./provide-scoped";

type EffectCandidate<A> = A | Effect.Effect<A, unknown, unknown>;

type HandleInput = Parameters<Handle>[0];

type HandleSource =
  | ((
      input: HandleInput,
    ) => EffectCandidate<Response> | Promise<EffectCandidate<Response>>)
  | Effect.Effect<Response, unknown, unknown>;

// oxlint-disable-next-line require-await
const runCandidate = async <A>(
  candidate: EffectCandidate<A>,
  input: HandleInput,
): Promise<A> => {
  if (!Effect.isEffect(candidate)) {
    return candidate;
  }

  return runWithRuntime(provideRequestScoped(candidate, input.event));
};

export const wrapHandle =
  (value: HandleSource): Handle =>
  async (input) => {
    const candidate = typeof value === "function" ? await value(input) : value;

    return runCandidate(candidate, input);
  };

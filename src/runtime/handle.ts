import type { Handle } from "@sveltejs/kit";

import { Effect } from "effect";

import { runWithRuntime } from "./managed-runtime.js";
import { provideHandleScoped } from "./provide-scoped.js";

import type { SvelteHandleInput as HandleInput } from "./types.js";

type EffectCandidate<A> = A | Effect.Effect<A, unknown, unknown>;

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

  return runWithRuntime(provideHandleScoped(candidate, input));
};

export const wrapHandle =
  (value: HandleSource): Handle =>
  async (input) => {
    const candidate = typeof value === "function" ? await value(input) : value;

    return runCandidate(candidate, input);
  };

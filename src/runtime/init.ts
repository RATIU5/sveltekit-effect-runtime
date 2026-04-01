import type { ServerInit } from "@sveltejs/kit";

import { Effect } from "effect";

import { runWithRuntime } from "./managed-runtime.js";

type EffectCandidate<A> = A | Effect.Effect<A, unknown, unknown>;

type InitSource =
  | (() => EffectCandidate<void> | Promise<EffectCandidate<void>>)
  | Effect.Effect<void, unknown, unknown>;

export const wrapInit =
  (value: InitSource): ServerInit =>
  async () => {
    const candidate = typeof value === "function" ? await value() : value;
    if (!Effect.isEffect(candidate)) {
      return candidate;
    }

    return runWithRuntime(candidate);
  };

import type { RequestEvent, RequestHandler } from "@sveltejs/kit";

// oxlint-disable require-await
import { Effect } from "effect";

import { runWithRuntime } from "./managed-runtime";
import { provideRequestScoped } from "./provide-scoped";

type EffectCandidate<A> = A | Effect.Effect<A, unknown, unknown>;

type AnyRequestEvent = Parameters<RequestHandler>[0];

type HandlerSource<Event extends AnyRequestEvent = AnyRequestEvent> =
  | ((
      event: Event,
    ) => EffectCandidate<Response> | Promise<EffectCandidate<Response>>)
  | Effect.Effect<Response, unknown, unknown>;

const runCandidate = async <A>(
  candidate: EffectCandidate<A>,
  event: RequestEvent,
): Promise<A> => {
  if (!Effect.isEffect(candidate)) {
    return candidate;
  }

  return runWithRuntime(provideRequestScoped(candidate, event));
};

export const wrapHandler =
  <Event extends AnyRequestEvent>(value: HandlerSource<Event>) =>
  async (event: Event) => {
    const candidate = typeof value === "function" ? await value(event) : value;

    return runCandidate(candidate, event);
  };

import {
  isActionFailure,
  type ActionFailure,
  type Actions,
  type RequestEvent,
} from "@sveltejs/kit";
import { Effect } from "effect";

import { runWithRuntime } from "./managed-runtime.js";
import { provideRequestScoped } from "./provide-scoped.js";

type ActionResult = Record<string, unknown> | void | ActionFailure<unknown>;

type EffectCandidate<A> = A | Effect.Effect<A, unknown, unknown>;

type ActionSource<
  Event extends RequestEvent = RequestEvent,
  OutputData extends ActionResult = ActionResult,
> =
  | ((
      event: Event,
    ) => EffectCandidate<OutputData> | Promise<EffectCandidate<OutputData>>)
  | Effect.Effect<OutputData, unknown, unknown>;

const runCandidate = async (
  candidate: EffectCandidate<ActionResult>,
  event: RequestEvent,
): Promise<ActionResult> => {
  if (!Effect.isEffect(candidate)) {
    return candidate;
  }

  try {
    return await runWithRuntime(provideRequestScoped(candidate, event));
  } catch (error) {
    if (isActionFailure(error)) {
      return error;
    }

    throw error;
  }
};

const wrapAction =
  <Event extends RequestEvent, OutputData extends ActionResult>(
    value: ActionSource<Event, OutputData>,
  ) =>
  async (event: Event): Promise<OutputData> => {
    const candidate = typeof value === "function" ? await value(event) : value;

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return (await runCandidate(candidate, event)) as OutputData;
  };

type WrappedActionMap<T extends Record<string, ActionSource>> = {
  [K in keyof T]: T[K] extends ActionSource<infer Event, infer OutputData>
    ? (event: Event) => Promise<OutputData>
    : never;
};

export const wrapActions = <T extends Record<string, ActionSource>>(
  value: T,
): WrappedActionMap<T> & Actions => {
  const wrappedEntries = Object.entries(value).map(
    ([key, action]) => [key, wrapAction(action)] as const,
  );

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return Object.fromEntries(wrappedEntries) as WrappedActionMap<T> & Actions;
};

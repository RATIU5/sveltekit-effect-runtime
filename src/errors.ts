// oxlint-disable no-console
// oxlint-disable no-throw-literal
// oxlint-disable typescript/only-throw-error
// oxlint-disable max-statements

import {
  error,
  isActionFailure,
  isHttpError,
  isRedirect,
  type ActionFailure,
  type RequestEvent,
  type ServerLoadEvent,
} from "@sveltejs/kit";
import { Cause, Exit, Option } from "effect";

const reasonValue = (reason: Cause.Reason<unknown>): unknown => {
  if (Cause.isFailReason(reason)) {
    return reason.error;
  }
  if (Cause.isDieReason(reason)) {
    return reason.defect;
  }
  return undefined;
};

/**
 * Re-throws SvelteKit control-flow values verbatim; returns otherwise.
 *
 * `redirect(...)` and `error(...)` are thrown by SvelteKit as a transport
 * mechanism, so anything that surfaces with one of those shapes has to be
 * re-thrown rather than mapped to a 500.
 */
const throwIfControlFlow = (value: unknown): void => {
  if (isRedirect(value) || isHttpError(value)) {
    throw value;
  }
};

/**
 * Describes where in the SvelteKit request lifecycle an error occurred.
 *
 * Passed to `ErrorMapper` so translation logic can branch on the phase
 * (for example, returning a redirect from a form action but a 404 from a
 * load) and has access to the originating event.
 */
export type ErrorContext =
  | { readonly phase: "handle"; readonly event: RequestEvent }
  | { readonly phase: "handler"; readonly event: RequestEvent }
  | { readonly phase: "load"; readonly event: ServerLoadEvent }
  | {
      readonly phase: "action";
      readonly event: RequestEvent;
      readonly name: string;
    }
  | {
      readonly phase: "query" | "command" | "form";
      readonly event: RequestEvent;
    };

/**
 * Translates a typed failure from an Effect program into something
 * meaningful to SvelteKit.
 *
 * Return a SvelteKit `redirect(...)` or `error(...)` value to short-circuit
 * the response (the bridge will throw it for you). Anything else is logged
 * and turned into a 500, so returning the original error when you have no
 * better mapping is fine.
 */
export type ErrorMapper = (error: unknown, context: ErrorContext) => unknown;

/**
 * Converts an Effect exit into a return value, or throws the way SvelteKit expects.
 *
 * We walk every reason in the cause first because parallel or racing
 * effects can stack multiple failures — if any branch raised a redirect
 * it has to win, even when sibling branches failed with unrelated errors.
 *
 * Remaining typed failures pass through `mapError` once, giving callers a
 * chance to translate domain errors into redirects or HTTP errors; the
 * mapped value is re-checked against the same predicates. Anything still
 * left over (unmapped failures and defects) is logged with the full cause
 * and surfaced as a 500.
 */
export const translateExit = <A>(
  exit: Exit.Exit<A, unknown>,
  context: ErrorContext,
  mapError: ErrorMapper | undefined,
): A => {
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  const { cause } = exit;
  for (const reason of cause.reasons) {
    throwIfControlFlow(reasonValue(reason));
  }

  const failure = Cause.findErrorOption(cause);
  if (Option.isSome(failure)) {
    const mapped = mapError ? mapError(failure.value, context) : failure.value;
    throwIfControlFlow(mapped);
    console.error(
      "[sveltekit-effect-runtime] unhandled failure",
      mapped,
      Cause.pretty(cause),
    );
    throw error(500, "Internal Error");
  }

  console.error("[sveltekit-effect-runtime] defect", Cause.pretty(cause));
  throw error(500, "Internal Error");
};

/**
 * Action variant of {@link translateExit}.
 *
 * SvelteKit form actions can legitimately return an `ActionFailure` to
 * signal validation problems, so we surface them as return values rather
 * than throwing. Redirects and HTTP errors still throw the same way.
 */
export const translateActionExit = <A>(
  exit: Exit.Exit<A, unknown>,
  context: ErrorContext,
  mapError: ErrorMapper | undefined,
): A | ActionFailure<unknown> => {
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  const { cause } = exit;
  for (const reason of cause.reasons) {
    const value = reasonValue(reason);
    throwIfControlFlow(value);
    if (isActionFailure(value)) {
      return value;
    }
  }

  const failure = Cause.findErrorOption(cause);
  if (Option.isSome(failure)) {
    const mapped = mapError ? mapError(failure.value, context) : failure.value;
    throwIfControlFlow(mapped);
    if (isActionFailure(mapped)) {
      return mapped;
    }
    console.error(
      "[sveltekit-effect-runtime] unhandled failure",
      mapped,
      Cause.pretty(cause),
    );
    throw error(500, "Internal Error");
  }

  console.error("[sveltekit-effect-runtime] defect", Cause.pretty(cause));
  throw error(500, "Internal Error");
};

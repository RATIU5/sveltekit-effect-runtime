// oxlint-disable no-console
// oxlint-disable max-statements
// oxlint-disable no-throw-literal
// oxlint-disable typescript/only-throw-error
// oxlint-disable max-lines-per-function

import {
  error,
  isHttpError,
  isRedirect,
  type RequestEvent,
  type ServerLoadEvent,
} from "@sveltejs/kit";
import { Cause, Context, Exit, Option } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";

const reasonValue = (reason: Cause.Reason<unknown>): unknown => {
  if (Cause.isFailReason(reason)) {
    return reason.error;
  }
  if (Cause.isDieReason(reason)) {
    return reason.defect;
  }
  return undefined;
};

type InvocationLayerFactory<Event, ROut, E = never> =
  | Layer.Layer<ROut, E>
  | ((
      event: Event,
    ) => Layer.Layer<ROut, E> | Effect.Effect<Layer.Layer<ROut, E>, E>);

class CurrentRequestEvent extends Context.Service<
  CurrentRequestEvent,
  RequestEvent
>()("sveltekit-effect-runtime/CurrentRequestEvent") {}

class CurrentServerLoadEvent extends Context.Service<
  CurrentServerLoadEvent,
  ServerLoadEvent
>()("sveltekit-effect-runtime/CurrentServerLoadEvent") {}

const translateExit = <A>(
  exit: Exit.Exit<A, unknown>,
  context: ErrorContext,
  mapError: ErrorMapper | undefined,
): A => {
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  const { cause } = exit;
  for (const reason of cause.reasons) {
    const value = reasonValue(reason);
    if (isRedirect(value) || isHttpError(value)) {
      throw value;
    }
  }

  const failure = Cause.findErrorOption(cause);
  if (Option.isSome(failure)) {
    const mapped = mapError ? mapError(failure.value, context) : failure.value;
    if (isRedirect(mapped) || isHttpError(mapped)) {
      throw mapped;
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

export type ErrorContext =
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

export type ErrorMapper = (error: unknown, context: ErrorContext) => unknown;

export interface SvelteKitEffectRuntime<RApp, RReq = never, RLoad = never> {
  handler<A extends Response, E>(
    effect: Effect.Effect<A, E, RApp | RReq | CurrentRequestEvent>,
  ): (event: RequestEvent) => Promise<A>;
  load<A extends Record<string, unknown>, E>(
    effect: Effect.Effect<A, E, RLoad | RApp | CurrentServerLoadEvent>,
  ): (event: ServerLoadEvent) => Promise<A>;
  readonly CurrentRequestEvent: Effect.Effect<
    RequestEvent,
    never,
    CurrentRequestEvent
  >;
  readonly CurrentServerLoadEvent: Effect.Effect<
    ServerLoadEvent,
    never,
    CurrentServerLoadEvent
  >;
}

export interface SvelteKitEffectBridgeOptions<
  RApp,
  EApp,
  RReq,
  EReq,
  RLoad,
  ELoad,
> {
  readonly runtime?: ManagedRuntime.ManagedRuntime<RApp, EApp>;
  readonly requestLayer?: InvocationLayerFactory<RequestEvent, RReq, EReq>;
  readonly loadLayer?: InvocationLayerFactory<ServerLoadEvent, RLoad, ELoad>;
  readonly mapError?: ErrorMapper;
  readonly memoMap?: Layer.MemoMap;
}

export interface SvelteKitEffectRuntimeStatic {
  make(): SvelteKitEffectRuntime<never>;
  make<RApp, EApp, RReq, EReq, RLoad, ELoad>(
    options: SvelteKitEffectBridgeOptions<RApp, EApp, RReq, EReq, RLoad, ELoad>,
  ): SvelteKitEffectRuntime<RApp, RReq>;
}

export const SvelteKitEffectRuntime: SvelteKitEffectRuntimeStatic = {
  make<RApp, EApp, RReq, EReq, RLoad, ELoad>(
    options?: SvelteKitEffectBridgeOptions<
      RApp,
      EApp,
      RReq,
      EReq,
      RLoad,
      ELoad
    >,
  ): SvelteKitEffectRuntime<RApp, RReq, RLoad> {
    const {
      runtime = ManagedRuntime.make(Layer.empty),
      requestLayer = Layer.empty,
      loadLayer = Layer.empty,
      memoMap = Layer.makeMemoMapUnsafe(),
      mapError,
    } = options ?? {};
    return {
      handler<A extends Response, E>(
        effect: Effect.Effect<A, E, RApp | RReq | CurrentRequestEvent>,
      ) {
        return async (_event: RequestEvent): Promise<A> => {
          const program = Effect.scoped(
            Effect.gen(function* () {
              const resolved =
                typeof requestLayer === "function"
                  ? requestLayer(_event)
                  : requestLayer;
              const resolvedLayer = Effect.isEffect(resolved)
                ? yield* resolved
                : resolved;

              const requestContext = yield* Layer.build(resolvedLayer);
              const eventContext = Context.make(CurrentRequestEvent, _event);
              return yield* effect.pipe(
                Effect.provideContext(
                  Context.mergeAll(requestContext, eventContext),
                ),
              );
            }),
          );

          const exit = await runtime.runPromiseExit(program, {
            signal: _event.request.signal,
          });

          return translateExit(
            exit,
            { phase: "handler", event: _event },
            mapError,
          );
        };
      },

      load<A extends Record<string, unknown>, E>(
        effect: Effect.Effect<A, E, RApp | RLoad | CurrentServerLoadEvent>,
      ) {
        return async (_event: ServerLoadEvent): Promise<A> => {
          const resolved =
            typeof loadLayer === "function" ? loadLayer(_event) : loadLayer;
          const program = Effect.scoped(
            Effect.gen(function* () {
              const loadResolvedLayer = Effect.isEffect(resolved)
                ? yield* resolved
                : resolved;
              const loadContext = yield* Layer.build(loadResolvedLayer);
              const eventContext = Context.make(CurrentServerLoadEvent, _event);
              return yield* effect.pipe(
                Effect.provideContext(
                  Context.mergeAll(loadContext, eventContext),
                ),
              );
            }),
          );

          const exit = await runtime.runPromiseExit(program, {
            signal: _event.request.signal,
          });

          return translateExit(
            exit,
            { phase: "load", event: _event },
            mapError,
          );
        };
      },
      CurrentRequestEvent: CurrentRequestEvent.asEffect(),
      CurrentServerLoadEvent: CurrentServerLoadEvent.asEffect(),
    };
  },
};

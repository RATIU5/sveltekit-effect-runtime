// oxlint-disable typescript/no-explicit-any
// oxlint-disable max-statements
// oxlint-disable max-lines-per-function

import type { StandardSchemaV1 } from "@standard-schema/spec";
import type {
  ActionFailure,
  Handle,
  InvalidField,
  RemoteCommand,
  RemoteForm,
  RemoteFormInput,
  RemoteQueryFunction,
  RequestEvent,
  ServerLoadEvent,
} from "@sveltejs/kit";

import {
  command as remoteCommand,
  form as remoteForm,
  getRequestEvent,
  query as remoteQuery,
} from "$app/server";
import { Context } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";

import { translateActionExit, translateExit, type ErrorMapper } from "./errors";
import { CurrentRequestEvent, CurrentServerLoadEvent } from "./events";

// SvelteKit's published types for `command` declare the callback as
// `(arg) => Output` — unlike `query` / `form` which use
// `(arg) => MaybePromise<Output>`. Their runtime wraps the call in
// `Promise.resolve(...)`, so async callbacks are supported in practice.
// Augment the module to add the matching async-returning overloads;
// declared first, they take precedence over the upstream sync-only
// signatures during overload resolution.
declare module "$app/server" {
  export function command<Output>(
    fn: () => Output | Promise<Output>,
  ): RemoteCommand<void, Output>;
  export function command<Input, Output>(
    validate: "unchecked",
    fn: (arg: Input) => Output | Promise<Output>,
  ): RemoteCommand<Input, Output>;
  export function command<Schema extends StandardSchemaV1, Output>(
    validate: Schema,
    fn: (arg: StandardSchemaV1.InferOutput<Schema>) => Output | Promise<Output>,
  ): RemoteCommand<StandardSchemaV1.InferInput<Schema>, Output>;
}

type EffectSuccess<T> =
  T extends Effect.Effect<infer A, unknown, unknown> ? A : never;
type EffectError<T> =
  T extends Effect.Effect<unknown, infer E, unknown> ? E : never;

type InvocationLayerFactory<Event, RIn, ROut, E = never> =
  | Layer.Layer<ROut, E, RIn>
  | ((
      event: Event,
    ) =>
      | Layer.Layer<ROut, E, RIn>
      | Effect.Effect<Layer.Layer<ROut, E, RIn>, E, RIn>);

type HandleInput = Parameters<Handle>[0];
type EffectHandleInput = Omit<HandleInput, "resolve"> & {
  readonly resolve: HandleInput["resolve"];
};

/**
 * The bridge between Effect programs and SvelteKit's server entry points.
 *
 * Type parameters track which services the runtime can provide:
 *   - `RApp`  — services supplied by the shared application layer
 *   - `RReq`  — services supplied by the per-request layer (server hooks)
 *   - `RLoad` — services supplied by the per-load layer
 *
 * Build one via `SvelteKitEffectRuntime.make(...)` and reuse it across
 * your `+server.ts`, `+page.server.ts`, and `hooks.server.ts` files.
 */
export interface SvelteKitEffectRuntime<
  RApp,
  RReq = never,
  RLoad = never,
  RRemote = RReq,
> {
  /**
   * Wraps an Effect-producing function into SvelteKit's server `handle`
   * hook (the export from `src/hooks.server.ts`).
   *
   * The callback receives `{ event, resolve }`, where `resolve` is the
   * normal SvelteKit resolver. This lets hooks short-circuit, await
   * `resolve(event)`, or pass the raw resolver to middleware expecting
   * SvelteKit's native `resolve` function. The returned effect may require
   * any of the app-level or request-level services plus
   * `CurrentRequestEvent`.
   *
   * `resolve(...)` itself returns a response rather than throwing route
   * errors; failures from the Effect program still pass through
   * `mapError` and SvelteKit control-flow values are preserved.
   */
  handle<E>(
    f: (
      input: EffectHandleInput,
    ) => Effect.Effect<Response, E, RApp | RReq | CurrentRequestEvent>,
  ): Handle;
  /**
   * Wraps an Effect that produces a `Response` into a SvelteKit server
   * handler (the export from `+server.ts`).
   *
   * The effect may require any of the app-level or request-level services
   * plus `CurrentRequestEvent`, which is always provided. Redirects and
   * `error(...)` values thrown inside the effect propagate out with their
   * original meaning; everything else goes through `mapError` and finally
   * becomes a 500 if unhandled.
   */
  handler<A extends Response, E>(
    effect: Effect.Effect<A, E, RApp | RReq | CurrentRequestEvent>,
  ): (event: RequestEvent) => Promise<A>;
  /**
   * Wraps an Effect that returns load data into a SvelteKit `load`
   * function (the export from `+page.server.ts` / `+layout.server.ts`).
   *
   * The effect may require any of the app-level or load-level services
   * plus `CurrentServerLoadEvent`. Redirects and HTTP errors short-circuit
   * the load the way SvelteKit expects; unhandled failures surface as 500s.
   */
  load<A extends Record<string, unknown>, E>(
    effect: Effect.Effect<A, E, RLoad | RApp | CurrentServerLoadEvent>,
  ): (event: ServerLoadEvent) => Promise<A>;
  /**
   * Wraps a record of Effect-based actions into a SvelteKit `actions`
   * export (the second `+page.server.ts` export alongside `load`).
   *
   * Each action is an `Effect` that may require any of the app-level or
   * request-level services plus `CurrentRequestEvent`. The returned object
   * has the same keys, with each value as a SvelteKit-shaped action
   * function. Per-action success types are preserved at the type level.
   *
   * `redirect(...)` and `error(...)` short-circuit normally. `fail(...)`
   * values surfaced via the failure channel are returned as the action
   * result (matching SvelteKit's idiomatic returned-fail shape) rather
   * than thrown, so domain code can model invalid form input with
   * `Effect.fail(fail(400, ...))`.
   */
  actions<
    T extends Record<
      string,
      Effect.Effect<unknown, unknown, RApp | RReq | CurrentRequestEvent>
    >,
  >(
    effects: T,
  ): {
    [K in keyof T]: (
      event: RequestEvent,
    ) => Promise<
      EffectSuccess<T[K]> | Extract<EffectError<T[K]>, ActionFailure<unknown>>
    >;
  };
  /**
   * Wraps an Effect into a SvelteKit remote `query` function (the export
   * from `*.remote.ts`).
   *
   * The effect may require any of the app-level or remote-level services
   * plus `CurrentRequestEvent`. The returned function is what SvelteKit's
   * `$app/server.query(...)` produces, so it can be imported and awaited
   * from `+page.svelte`, `load`, or other remote functions.
   *
   * Overloads:
   * - nullary: `runtime.query(effect)` returns a `RemoteQueryFunction<void, A>`
   * - schema:  `runtime.query(schema, (input) => effect)` validates the
   *   client-supplied argument with a Standard Schema before running the
   *   effect; the input type comes from the schema's inferred output.
   *
   * Validation issues raised by the schema short-circuit before the
   * effect runs and are surfaced by SvelteKit, not through `mapError`.
   */
  query<A, E>(
    effect: Effect.Effect<A, E, RApp | RRemote | CurrentRequestEvent>,
  ): RemoteQueryFunction<void, A>;
  query<S extends StandardSchemaV1, A, E>(
    schema: S,
    f: (
      input: StandardSchemaV1.InferOutput<S>,
    ) => Effect.Effect<A, E, RApp | RRemote | CurrentRequestEvent>,
  ): RemoteQueryFunction<StandardSchemaV1.InferInput<S>, A>;
  /**
   * Wraps an Effect into a SvelteKit remote `form` function (the export
   * from `*.remote.ts`).
   *
   * The effect may require any of the app-level or remote-level services
   * plus `CurrentRequestEvent`. The returned value is a `RemoteForm` that
   * can be spread onto a `<form>` element from a Svelte component.
   *
   * Form submissions hit SvelteKit's form transport. Use the schema or
   * `unchecked` overload to receive SvelteKit's parsed form payload; the
   * current `RequestEvent` is also available through `CurrentRequestEvent`.
   *
   * Redirects and HTTP errors short-circuit normally; unhandled failures
   * surface as 500s after `mapError`.
   */
  form<A, E>(
    effect: Effect.Effect<A, E, RApp | RRemote | CurrentRequestEvent>,
  ): RemoteForm<void, A>;
  form<Input extends RemoteFormInput, A, E>(
    validate: "unchecked",
    f: (
      input: Input,
      issue: InvalidField<Input>,
    ) => Effect.Effect<A, E, RApp | RRemote | CurrentRequestEvent>,
  ): RemoteForm<Input, A>;
  form<
    S extends StandardSchemaV1<RemoteFormInput, Record<string, unknown>>,
    A,
    E,
  >(
    schema: S,
    f: (
      input: StandardSchemaV1.InferOutput<S>,
      issue: InvalidField<StandardSchemaV1.InferInput<S>>,
    ) => Effect.Effect<A, E, RApp | RRemote | CurrentRequestEvent>,
  ): RemoteForm<StandardSchemaV1.InferInput<S>, A>;
  /**
   * Wraps an Effect into a SvelteKit remote `command` function (the export
   * from `*.remote.ts`).
   *
   * Commands are mutating remote calls — SvelteKit only invokes them from
   * non-GET requests outside of SSR, validating the client-supplied input
   * against the Standard Schema before the callback runs. The effect may
   * require any of the app-level or remote-level services plus
   * `CurrentRequestEvent`; remote layers and the current event are
   * provisioned the same way as `query` and `form`.
   *
   * Validation issues raised by the schema short-circuit before the effect
   * runs and are surfaced by SvelteKit, not through `mapError`. Redirects
   * and HTTP errors short-circuit normally; unhandled failures surface as
   * 500s after `mapError`.
   */
  command<S extends StandardSchemaV1, A, E>(
    schema: S,
    f: (
      input: StandardSchemaV1.InferOutput<S>,
    ) => Effect.Effect<A, E, RApp | RRemote | CurrentRequestEvent>,
  ): RemoteCommand<StandardSchemaV1.InferInput<S>, A>;
  /**
   * Access to the current `RequestEvent` from inside a handler effect.
   *
   * Use inside an `Effect.gen` via `yield*` (or `Effect.flatMap`) when a
   * service needs cookies, headers, or other request-scoped data without
   * threading the event through every call site.
   */
  readonly CurrentRequestEvent: Effect.Effect<
    RequestEvent,
    never,
    CurrentRequestEvent
  >;
  /**
   * Access to the current `ServerLoadEvent` from inside a load effect.
   *
   * Same shape as `CurrentRequestEvent` but scoped to `load`; exposes
   * load-only fields like `params`, `route`, and `parent`.
   */
  readonly CurrentServerLoadEvent: Effect.Effect<
    ServerLoadEvent,
    never,
    CurrentServerLoadEvent
  >;
}

/**
 * Full set of options accepted by `SvelteKitEffectRuntime.make`.
 *
 * In practice the public overloads narrow this to either
 * `{ runtime }` or `{ layer, memoMap? }` — the two forms are mutually
 * exclusive because a `ManagedRuntime` already owns its own memo map.
 */
export type SvelteKitEffectBridgeOptions<
  RApp,
  EApp,
  RReq = never,
  EReq = never,
  RLoad = never,
  ELoad = never,
  RRemote = RReq,
  ERemote = EReq,
> =
  | {
      /** Pre-built runtime to reuse. Mutually exclusive with `layer`. */
      readonly runtime: ManagedRuntime.ManagedRuntime<RApp, EApp>;
      readonly layer?: never;
      readonly memoMap?: never;
      /**
       * Layer (or factory) evaluated once per handler invocation. Useful for
       * request-scoped services that depend on headers, cookies, or the URL.
       */
      readonly requestLayer?: InvocationLayerFactory<
        RequestEvent,
        RApp | CurrentRequestEvent,
        RReq,
        EReq
      >;
      /**
       * Layer (or factory) evaluated once per load invocation. Same idea as
       * `requestLayer` but for `load` events.
       */
      readonly loadLayer?: InvocationLayerFactory<
        ServerLoadEvent,
        RApp | CurrentServerLoadEvent,
        RLoad,
        ELoad
      >;
      /**
       * Layer (or factory) evaluated once per remote-function invocation.
       * Defaults to `requestLayer` when omitted.
       */
      readonly remoteLayer?: InvocationLayerFactory<
        RequestEvent,
        RApp | CurrentRequestEvent,
        RRemote,
        ERemote
      >;
      /** Translates typed Effect failures into SvelteKit-visible results. */
      readonly mapError?: ErrorMapper;
    }
  | {
      readonly runtime?: never;
      /** Application-wide layer. Mutually exclusive with `runtime`. */
      readonly layer: Layer.Layer<RApp, EApp>;
      /**
       * Shared memo map for building the app layer. Pass one when multiple
       * runtimes need to share singleton services across module boundaries.
       */
      readonly memoMap?: Layer.MemoMap;
      /**
       * Layer (or factory) evaluated once per handler invocation. Useful for
       * request-scoped services that depend on headers, cookies, or the URL.
       */
      readonly requestLayer?: InvocationLayerFactory<
        RequestEvent,
        RApp | CurrentRequestEvent,
        RReq,
        EReq
      >;
      /**
       * Layer (or factory) evaluated once per load invocation. Same idea as
       * `requestLayer` but for `load` events.
       */
      readonly loadLayer?: InvocationLayerFactory<
        ServerLoadEvent,
        RApp | CurrentServerLoadEvent,
        RLoad,
        ELoad
      >;
      /**
       * Layer (or factory) evaluated once per remote-function invocation.
       * Defaults to `requestLayer` when omitted.
       */
      readonly remoteLayer?: InvocationLayerFactory<
        RequestEvent,
        RApp | CurrentRequestEvent,
        RRemote,
        ERemote
      >;
      /** Translates typed Effect failures into SvelteKit-visible results. */
      readonly mapError?: ErrorMapper;
    }
  | {
      readonly runtime?: never;
      readonly layer?: never;
      /**
       * Shared memo map for the empty app layer. Mostly useful when callers
       * want to add only request/load options without app-level services.
       */
      readonly memoMap?: Layer.MemoMap;
      /**
       * Layer (or factory) evaluated once per handler invocation. Useful for
       * request-scoped services that depend on headers, cookies, or the URL.
       */
      readonly requestLayer?: InvocationLayerFactory<
        RequestEvent,
        CurrentRequestEvent,
        RReq,
        EReq
      >;
      /**
       * Layer (or factory) evaluated once per load invocation. Same idea as
       * `requestLayer` but for `load` events.
       */
      readonly loadLayer?: InvocationLayerFactory<
        ServerLoadEvent,
        CurrentServerLoadEvent,
        RLoad,
        ELoad
      >;
      /**
       * Layer (or factory) evaluated once per remote-function invocation.
       * Defaults to `requestLayer` when omitted.
       */
      readonly remoteLayer?: InvocationLayerFactory<
        RequestEvent,
        CurrentRequestEvent,
        RRemote,
        ERemote
      >;
      /** Translates typed Effect failures into SvelteKit-visible results. */
      readonly mapError?: ErrorMapper;
    };

export interface SvelteKitEffectRuntimeStatic {
  make(): SvelteKitEffectRuntime<never>;
  make<
    RApp,
    EApp,
    RReq = never,
    EReq = never,
    RLoad = never,
    ELoad = never,
    RRemote = RReq,
    ERemote = EReq,
  >(
    options: SvelteKitEffectBridgeOptions<
      RApp,
      EApp,
      RReq,
      EReq,
      RLoad,
      ELoad,
      RRemote,
      ERemote
    >,
  ): SvelteKitEffectRuntime<RApp, RReq, RLoad, RRemote>;
}

/**
 * Constructs a runtime that wires Effect programs into SvelteKit's
 * `load` and server-handler entry points.
 *
 * Callers pass either a pre-built `ManagedRuntime` or a `Layer`. When a
 * layer is supplied we build it once through a shared `MemoMap` so
 * repeated instantiations across hot reloads or re-imports share the
 * same service instances. The optional `requestLayer`, `loadLayer`, and
 * `remoteLayer` factories are rebuilt per invocation so they can close
 * over the current event without sharing request-derived services.
 */
export const SvelteKitEffectRuntime: SvelteKitEffectRuntimeStatic = {
  make(options?: {
    runtime?: ManagedRuntime.ManagedRuntime<any, any>;
    layer?: Layer.Layer<any, any>;
    memoMap?: Layer.MemoMap;
    requestLayer?: InvocationLayerFactory<
      RequestEvent,
      CurrentRequestEvent,
      any,
      any
    >;
    loadLayer?: InvocationLayerFactory<
      ServerLoadEvent,
      CurrentServerLoadEvent,
      any,
      any
    >;
    remoteLayer?: InvocationLayerFactory<
      RequestEvent,
      CurrentRequestEvent,
      any,
      any
    >;
    mapError?: ErrorMapper;
  }): SvelteKitEffectRuntime<any, any, any> {
    const {
      runtime: providedRuntime,
      layer,
      requestLayer = Layer.empty,
      loadLayer = Layer.empty,
      remoteLayer,
      memoMap = Layer.makeMemoMapUnsafe(),
      mapError,
    } = options ?? {};
    const effectiveRemoteLayer = remoteLayer ?? requestLayer;

    // Impl-level type escape: public overloads of `make` guarantee the
    // returned runtime's capabilities match the effects passed to
    // handler/load. Internally we erase to `<any, any>` so the inner
    // methods can pass their `any`-typed programs to runPromiseExit.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const runtime = (providedRuntime ??
      ManagedRuntime.make(layer ?? Layer.empty, {
        memoMap,
      })) as ManagedRuntime.ManagedRuntime<any, any>;
    return {
      handle<E>(
        fn: (input: EffectHandleInput) => Effect.Effect<Response, E, any>,
      ): Handle {
        return async (input): Promise<Response> => {
          const program = Effect.scoped(
            Effect.gen(function* () {
              const eventContext = Context.make(
                CurrentRequestEvent,
                input.event,
              );
              const resolved =
                typeof requestLayer === "function"
                  ? requestLayer(input.event)
                  : requestLayer;
              const resolvedLayer = Effect.isEffect(resolved)
                ? yield* resolved.pipe(Effect.provideContext(eventContext))
                : resolved;

              const requestContext = yield* Layer.build(resolvedLayer).pipe(
                Effect.provideContext(eventContext),
              );
              const effectInput: EffectHandleInput = {
                event: input.event,
                resolve: input.resolve,
              };
              return yield* fn(effectInput).pipe(
                Effect.provideContext(
                  Context.mergeAll(requestContext, eventContext),
                ),
              );
            }),
          );

          const exit = await runtime.runPromiseExit(program, {
            signal: input.event.request.signal,
          });

          return translateExit(
            exit,
            { phase: "handle", event: input.event },
            mapError,
          );
        };
      },

      handler<A extends Response, E>(effect: Effect.Effect<A, E, any>) {
        return async (_event: RequestEvent): Promise<A> => {
          // The request layer is rebuilt per invocation so it can close
          // over the current event; `Effect.scoped` guarantees that any
          // finalizers allocated by `Layer.build` run when the response
          // is returned (or when the request is aborted).
          const program = Effect.scoped(
            Effect.gen(function* () {
              const eventContext = Context.make(CurrentRequestEvent, _event);
              const resolved =
                typeof requestLayer === "function"
                  ? requestLayer(_event)
                  : requestLayer;
              const resolvedLayer = Effect.isEffect(resolved)
                ? yield* resolved.pipe(Effect.provideContext(eventContext))
                : resolved;

              const requestContext = yield* Layer.build(resolvedLayer).pipe(
                Effect.provideContext(eventContext),
              );
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
        effect: Effect.Effect<A, E, any>,
      ) {
        return async (_event: ServerLoadEvent): Promise<A> => {
          const program = Effect.scoped(
            Effect.gen(function* () {
              const eventContext = Context.make(CurrentServerLoadEvent, _event);
              const resolved =
                typeof loadLayer === "function" ? loadLayer(_event) : loadLayer;
              const loadResolvedLayer = Effect.isEffect(resolved)
                ? yield* resolved.pipe(Effect.provideContext(eventContext))
                : resolved;
              const loadContext = yield* Layer.build(loadResolvedLayer).pipe(
                Effect.provideContext(eventContext),
              );
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

      actions<T extends Record<string, Effect.Effect<unknown, unknown, any>>>(
        effects: T,
      ) {
        const wrapped = {} as Record<
          string,
          (event: RequestEvent) => Promise<unknown>
        >;
        for (const [name, effect] of Object.entries(effects)) {
          wrapped[name] = async (_event: RequestEvent): Promise<unknown> => {
            const program = Effect.scoped(
              Effect.gen(function* () {
                const eventContext = Context.make(CurrentRequestEvent, _event);
                const resolved =
                  typeof requestLayer === "function"
                    ? requestLayer(_event)
                    : requestLayer;
                const resolvedLayer = Effect.isEffect(resolved)
                  ? yield* resolved.pipe(Effect.provideContext(eventContext))
                  : resolved;

                const requestContext = yield* Layer.build(resolvedLayer).pipe(
                  Effect.provideContext(eventContext),
                );
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

            return translateActionExit(
              exit,
              { phase: "action", event: _event, name },
              mapError,
            );
          };
        }
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        return wrapped as {
          [K in keyof T]: (
            event: RequestEvent,
          ) => Promise<
            | EffectSuccess<T[K]>
            | Extract<EffectError<T[K]>, ActionFailure<unknown>>
          >;
        };
      },

      query(
        schemaOrEffect: StandardSchemaV1 | Effect.Effect<unknown, unknown, any>,
        fn?: (input: unknown) => Effect.Effect<unknown, unknown, any>,
      ): RemoteQueryFunction<any, any> {
        // SvelteKit's `query` callback executes inside the request store,
        // so `getRequestEvent()` is the documented way to recover the
        // current `RequestEvent` for layer/context provision. Validation
        // (when a schema is supplied) is performed by SvelteKit before
        // the callback runs, so we never see invalid input here.
        const runEffect = async (
          effect: Effect.Effect<unknown, unknown, any>,
        ): Promise<unknown> => {
          const event = getRequestEvent();
          const program = Effect.scoped(
            Effect.gen(function* () {
              const eventContext = Context.make(CurrentRequestEvent, event);
              const resolved =
                typeof effectiveRemoteLayer === "function"
                  ? effectiveRemoteLayer(event)
                  : effectiveRemoteLayer;
              const resolvedLayer = Effect.isEffect(resolved)
                ? yield* resolved.pipe(Effect.provideContext(eventContext))
                : resolved;

              const requestContext = yield* Layer.build(resolvedLayer).pipe(
                Effect.provideContext(eventContext),
              );
              return yield* effect.pipe(
                Effect.provideContext(
                  Context.mergeAll(requestContext, eventContext),
                ),
              );
            }),
          );

          const exit = await runtime.runPromiseExit(program, {
            signal: event.request.signal,
          });

          return translateExit(exit, { phase: "query", event }, mapError);
        };

        // `Effect.isEffect` is a type guard, so each branch narrows the
        // union without an `as` cast. SvelteKit's `query` overload return
        // types are structurally assignable to `RemoteQueryFunction<any, any>`.
        if (Effect.isEffect(schemaOrEffect)) {
          return remoteQuery(() => runEffect(schemaOrEffect));
        }
        if (fn === undefined) {
          throw new TypeError(
            "runtime.query: schema form requires a function as the second argument",
          );
        }
        return remoteQuery(schemaOrEffect, (input) => runEffect(fn(input)));
      },

      form(
        schemaOrEffect:
          | "unchecked"
          | StandardSchemaV1<RemoteFormInput, Record<string, unknown>>
          | Effect.Effect<unknown, unknown, any>,
        fn?: (
          input: unknown,
          issue: InvalidField<RemoteFormInput>,
        ) => Effect.Effect<unknown, unknown, any>,
      ): RemoteForm<any, any> {
        // SvelteKit's `form` callback runs after SvelteKit has parsed the
        // remote form body. For schema / unchecked forms, pass that parsed
        // input into the user's Effect callback instead of reading the body
        // again from `event.request`.
        const runEffect = async (
          effect: Effect.Effect<unknown, unknown, any>,
        ): Promise<unknown> => {
          const event = getRequestEvent();
          const program = Effect.scoped(
            Effect.gen(function* () {
              const eventContext = Context.make(CurrentRequestEvent, event);
              const resolved =
                typeof effectiveRemoteLayer === "function"
                  ? effectiveRemoteLayer(event)
                  : effectiveRemoteLayer;
              const resolvedLayer = Effect.isEffect(resolved)
                ? yield* resolved.pipe(Effect.provideContext(eventContext))
                : resolved;

              const requestContext = yield* Layer.build(resolvedLayer).pipe(
                Effect.provideContext(eventContext),
              );
              return yield* effect.pipe(
                Effect.provideContext(
                  Context.mergeAll(requestContext, eventContext),
                ),
              );
            }),
          );

          const exit = await runtime.runPromiseExit(program, {
            signal: event.request.signal,
          });

          return translateExit(exit, { phase: "form", event }, mapError);
        };

        if (Effect.isEffect(schemaOrEffect)) {
          return remoteForm(() => runEffect(schemaOrEffect));
        }
        if (fn === undefined) {
          throw new TypeError(
            "runtime.form: schema or unchecked form requires a function as the second argument",
          );
        }
        if (schemaOrEffect === "unchecked") {
          return remoteForm("unchecked", (input, issue) =>
            runEffect(fn(input, issue)),
          );
        }
        return remoteForm(schemaOrEffect, (input, issue) =>
          runEffect(fn(input, issue)),
        );
      },

      command<S extends StandardSchemaV1, A, E>(
        schema: S,
        fn: (
          input: StandardSchemaV1.InferOutput<S>,
        ) => Effect.Effect<A, E, any>,
      ): RemoteCommand<StandardSchemaV1.InferInput<S>, A> {
        // SvelteKit validates `input` against the schema before calling
        // this callback, so we receive an already-validated value. The
        // request store is active here, so `getRequestEvent()` is the
        // documented way to recover the current `RequestEvent` for
        // layer/context provision — same pattern as `query` and `form`.
        // The local `declare module "$app/server"` augmentation above
        // adds an async-returning overload, so the inferred `Output` is
        // `A` rather than `Promise<A>`.
        return remoteCommand(schema, async (input): Promise<A> => {
          const event = getRequestEvent();
          const program = Effect.scoped(
            Effect.gen(function* () {
              const eventContext = Context.make(CurrentRequestEvent, event);
              const resolved =
                typeof effectiveRemoteLayer === "function"
                  ? effectiveRemoteLayer(event)
                  : effectiveRemoteLayer;
              const resolvedLayer = Effect.isEffect(resolved)
                ? yield* resolved.pipe(Effect.provideContext(eventContext))
                : resolved;

              const requestContext = yield* Layer.build(resolvedLayer).pipe(
                Effect.provideContext(eventContext),
              );
              return yield* fn(input).pipe(
                Effect.provideContext(
                  Context.mergeAll(requestContext, eventContext),
                ),
              );
            }),
          );

          const exit = await runtime.runPromiseExit(program, {
            signal: event.request.signal,
          });

          return translateExit(exit, { phase: "command", event }, mapError);
        });
      },
      CurrentRequestEvent: CurrentRequestEvent.asEffect(),
      CurrentServerLoadEvent: CurrentServerLoadEvent.asEffect(),
    };
  },
};

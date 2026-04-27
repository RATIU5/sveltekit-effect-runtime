import { error, redirect } from "@sveltejs/kit";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { Context, Data } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  CurrentRequestEvent,
  CurrentServerLoadEvent,
  SvelteKitEffectRuntime,
  type SvelteKitEffectRuntime as RuntimeBridge,
} from "../../../src/index";

const schema = <Input, Output>(
  validate: StandardSchemaV1.Props<Input, Output>["validate"],
): StandardSchemaV1<Input, Output> => ({
  "~standard": {
    version: 1,
    vendor: "example",
    validate,
  },
});

class NotFound extends Data.TaggedError("NotFound")<{
  readonly message: string;
}> {}

class NeedsLogin extends Data.TaggedError("NeedsLogin")<{
  readonly next: string;
}> {}

class AppConfig extends Context.Service<
  AppConfig,
  {
    readonly appName: string;
    readonly startedAt: Date;
  }
>()("example/AppConfig") {}

class RequestMeta extends Context.Service<
  RequestMeta,
  {
    readonly appName: string;
    readonly requestId: string;
    readonly path: string;
    readonly userAgent: string;
  }
>()("example/RequestMeta") {}

class LoadMeta extends Context.Service<
  LoadMeta,
  {
    readonly appName: string;
    readonly routeId: string | null;
    readonly path: string;
  }
>()("example/LoadMeta") {}

class DemoStore extends Context.Service<
  DemoStore,
  {
    readonly increment: (amount: number) => Effect.Effect<number>;
    readonly rememberName: (name: string) => Effect.Effect<string>;
    readonly saveNote: (message: string) => Effect.Effect<ReadonlyArray<string>>;
    readonly snapshot: () => Effect.Effect<{
      readonly counter: number;
      readonly lastName: string;
      readonly notes: ReadonlyArray<string>;
    }>;
  }
>()("example/DemoStore") {}

let counter = 0;
let lastName = "Ada";
let notes: ReadonlyArray<string> = ["Booted the Effect runtime"];

const AppLayer = Layer.mergeAll(
  Layer.succeed(AppConfig)({
    appName: "SvelteKit Effect Bridge",
    startedAt: new Date(),
  }),
  Layer.succeed(DemoStore)({
    increment: (amount) =>
      Effect.sync(() => {
        counter += amount;
        return counter;
      }),
    rememberName: (name) =>
      Effect.sync(() => {
        lastName = name;
        return lastName;
      }),
    saveNote: (message) =>
      Effect.sync(() => {
        notes = [message, ...notes].slice(0, 5);
        return notes;
      }),
    snapshot: () =>
      Effect.sync(() => ({
        counter,
        lastName,
        notes,
      })),
  }),
);

const runtime: RuntimeBridge<
  AppConfig | DemoStore,
  RequestMeta,
  LoadMeta
> = SvelteKitEffectRuntime.make({
  layer: AppLayer,
  requestLayer: Layer.effect(RequestMeta)(
    Effect.gen(function* () {
      const event = yield* CurrentRequestEvent.asEffect();
      const config = yield* AppConfig.asEffect();
      return {
        appName: config.appName,
        requestId: crypto.randomUUID(),
        path: event.url.pathname,
        userAgent: event.request.headers.get("user-agent") ?? "unknown",
      };
    }),
  ),
  loadLayer: Layer.effect(LoadMeta)(
    Effect.gen(function* () {
      const event = yield* CurrentServerLoadEvent.asEffect();
      const config = yield* AppConfig.asEffect();
      return {
        appName: config.appName,
        routeId: event.route.id,
        path: event.url.pathname,
      };
    }),
  ),
  mapError: (failure) => {
    if (failure instanceof NotFound) {
      return error(404, { message: failure.message });
    }
    if (failure instanceof NeedsLogin) {
      return redirect(303, `/login?next=${encodeURIComponent(failure.next)}`);
    }
    return failure;
  },
});

const numberSchema = schema<number, number>((value) =>
  typeof value === "number" && Number.isFinite(value)
    ? { value }
    : { issues: [{ message: "Expected a finite number" }] },
);

const nonEmptyStringSchema = schema<string, string>((value) =>
  typeof value === "string" && value.trim().length > 0
    ? { value: value.trim() }
    : { issues: [{ message: "Expected a non-empty string" }] },
);

export {
  AppConfig,
  DemoStore,
  LoadMeta,
  NeedsLogin,
  NotFound,
  RequestMeta,
  nonEmptyStringSchema,
  numberSchema,
  runtime,
};

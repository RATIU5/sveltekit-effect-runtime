# SvelteKit Effect Runtime

`sveltekit-effect-runtime` is a thin runtime adapter for running `Effect` programs at SvelteKit server edges.

It does not replace SvelteKit routing, actions, loads, or remote functions. It gives those entry points a shared Effect runtime, fresh invocation-local services, and SvelteKit-native error/control-flow behavior.

## Install

```sh
pnpm add sveltekit-effect-runtime effect@4.0.0-beta.52
# OR
bun add sveltekit-effect-runtime effect@4.0.0-beta.52
```

Effect v4 is required. You also need a compatible `@sveltejs/kit` project.

The package does not require Vite `ssr.noExternal` configuration. Remote
function helpers use SvelteKit's virtual `$app/server` module through an
explicit `remote` option, so that virtual import stays in your SvelteKit app
instead of inside the published package.

## Quick Start

Create one runtime instance and reuse it from your SvelteKit server modules.

```ts
// src/lib/server/runtime.ts
import { SvelteKitEffectRuntime } from "sveltekit-effect-runtime";

export const runtime = SvelteKitEffectRuntime.make();
```

```ts
// src/routes/api/+server.ts
import * as Effect from "effect/Effect";
import { runtime } from "$lib/server/runtime";

export const GET = runtime.handler(Effect.succeed(Response.json({ ok: true })));
```

## Runtime Setup

`SvelteKitEffectRuntime.make(...)` accepts either an existing `ManagedRuntime` or an app-level `Layer`.

```ts
import { Context } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { SvelteKitEffectRuntime } from "sveltekit-effect-runtime";

class AppConfig extends Context.Service<
  AppConfig,
  { readonly appName: string }
>()("app/AppConfig") {}

const AppLayer = Layer.succeed(AppConfig)({
  appName: "My app",
});

export const runtime = SvelteKitEffectRuntime.make({
  layer: AppLayer,
});
```

You can also pass:

- `runtime`: a pre-built `ManagedRuntime`
- `memoMap`: shared app-level layer memoization when `layer` is used
- `requestLayer`: fresh per handler/action invocation
- `loadLayer`: fresh per server `load` invocation
- `remoteLayer`: fresh per remote query/command/form invocation
- `remote`: SvelteKit's `$app/server` exports, required when using
  `query`, `command`, or `form`
- `mapError`: edge error translation

When `remoteLayer` is omitted, remote functions use `requestLayer`.

## Current Events

SvelteKit event access stays inside the Effect program.

```ts
export const GET = runtime.handler(
  Effect.gen(function* () {
    const event = yield* runtime.CurrentRequestEvent;
    return Response.json({
      path: event.url.pathname,
    });
  }),
);
```

Use:

- `runtime.CurrentRequestEvent` in handlers, actions, and remote functions
- `runtime.CurrentServerLoadEvent` in server loads

The service classes are also exported as `CurrentRequestEvent` and `CurrentServerLoadEvent` for layer definitions.

## Request And Load Services

Invocation layers are rebuilt for each call, so request-derived values are not cached across requests.

```ts
import { Context } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  CurrentRequestEvent,
  CurrentServerLoadEvent,
  SvelteKitEffectRuntime,
} from "sveltekit-effect-runtime";

class RequestMeta extends Context.Service<
  RequestMeta,
  { readonly path: string; readonly requestId: string }
>()("app/RequestMeta") {}

class LoadMeta extends Context.Service<
  LoadMeta,
  { readonly routeId: string | null }
>()("app/LoadMeta") {}

export const runtime = SvelteKitEffectRuntime.make({
  requestLayer: Layer.effect(RequestMeta)(
    Effect.gen(function* () {
      const event = yield* CurrentRequestEvent.asEffect();
      return {
        path: event.url.pathname,
        requestId: crypto.randomUUID(),
      };
    }),
  ),
  loadLayer: Layer.effect(LoadMeta)(
    Effect.gen(function* () {
      const event = yield* CurrentServerLoadEvent.asEffect();
      return {
        routeId: event.route.id,
      };
    }),
  ),
});
```

## Server Handlers

`runtime.handler(...)` wraps `+server.ts` method exports.

```ts
// src/routes/test/+server.ts
import * as Effect from "effect/Effect";
import { RequestMeta, runtime } from "$lib/server/runtime";

export const GET = runtime.handler(
  Effect.gen(function* () {
    const request = yield* RequestMeta.asEffect();
    return Response.json(request);
  }),
);
```

## Server Hooks

`runtime.handle(...)` wraps SvelteKit's `handle` hook in `src/hooks.server.ts`.
The hook callback receives SvelteKit's raw `{ event, resolve }` input, so you
can pass `resolve` directly to other SvelteKit middleware. When calling it from
inside `Effect.gen`, wrap or await it at the call site.

```ts
// src/hooks.server.ts
import * as Effect from "effect/Effect";
import { runtime } from "$lib/server/runtime";

export const handle = runtime.handle(({ event, resolve }) =>
  Effect.gen(function* () {
    const response = yield* Effect.promise(() =>
      Promise.resolve(
        resolve(event, {
          filterSerializedResponseHeaders: (name) => name === "x-request-id",
        }),
      ),
    );
    const writableResponse = new Response(response.body, response);

    writableResponse.headers.set("x-powered-by", "effect");
    return writableResponse;
  }),
);
```

Use `Effect.succeed(new Response(...))` to bypass SvelteKit entirely, pass the
raw `resolve` function to middleware that expects it, or wrap
`resolve(event, options)` to continue through SvelteKit's normal routing and
rendering inside an Effect.

## Server Loads

`runtime.load(...)` wraps server `load` functions in `+page.server.ts` and `+layout.server.ts`.

```ts
// src/routes/+page.server.ts
import * as Effect from "effect/Effect";
import { LoadMeta, runtime } from "$lib/server/runtime";

export const load = runtime.load(
  Effect.gen(function* () {
    const loadMeta = yield* LoadMeta.asEffect();
    return {
      loadMeta,
    };
  }),
);
```

## Actions

`runtime.actions(...)` wraps a SvelteKit `actions` object. Each action is a direct `Effect`.

```ts
// src/routes/+page.server.ts
import { fail } from "@sveltejs/kit";
import * as Effect from "effect/Effect";
import { runtime } from "$lib/server/runtime";

export const actions = runtime.actions({
  save: Effect.gen(function* () {
    const event = yield* runtime.CurrentRequestEvent;
    const form = yield* Effect.promise(() => event.request.formData());
    const name = String(form.get("name") ?? "").trim();

    if (name.length === 0) {
      return yield* Effect.fail(fail(400, { message: "Name is required" }));
    }

    return { ok: true, name };
  }),
});
```

`ActionFailure` values from `fail(...)` are returned as action results. Redirects and HTTP errors still short-circuit with SvelteKit semantics.

## Remote Functions

The runtime includes wrappers for SvelteKit remote functions:

- `runtime.query(...)`
- `runtime.command(...)`
- `runtime.form(...)`

Remote functions depend on SvelteKit's remote-function support and must be enabled in your SvelteKit app.
Because `$app/server` is a SvelteKit virtual module, import it in your app and
pass it to `SvelteKitEffectRuntime.make(...)`:

```ts
// src/lib/server/runtime.ts
import * as appServer from "$app/server";
import { SvelteKitEffectRuntime } from "sveltekit-effect-runtime";

export const runtime = SvelteKitEffectRuntime.make({
  remote: appServer,
});
```

```ts
// src/routes/data.remote.ts
import * as Effect from "effect/Effect";
import { runtime } from "$lib/server/runtime";

export const getSnapshot = runtime.query(
  Effect.gen(function* () {
    const event = yield* runtime.CurrentRequestEvent;
    return {
      path: event.url.pathname,
    };
  }),
);
```

Schema-backed query and command wrappers pass validated input into your Effect callback.

```ts
export const getTodo = runtime.query(todoIdSchema, (id) =>
  Effect.gen(function* () {
    return yield* Todos.getById(id);
  }),
);

export const toggleTodo = runtime.command(todoIdSchema, (id) =>
  Effect.gen(function* () {
    yield* Todos.toggle(id);
    return { ok: true };
  }),
);
```

Remote forms can be nullary or can receive parsed form input with `"unchecked"` or a Standard Schema.

```ts
import type { RemoteFormInput } from "@sveltejs/kit";

type NoteInput = RemoteFormInput & {
  readonly message?: string;
};

export const saveNote = runtime.form("unchecked", (input: NoteInput) =>
  Effect.gen(function* () {
    const message = (input.message ?? "").trim();
    return { message };
  }),
);
```

Use the remote form object directly for SvelteKit's default enhanced behavior:

```svelte
<script lang="ts">
  import { saveNote } from "./data.remote";
</script>

<form {...saveNote}>
  <input name="message" />
  <button type="submit" disabled={saveNote.pending > 0}>Save</button>
</form>
```

Call `saveNote.enhance(callback)` only when you need a custom submit callback.

## Error Mapping

SvelteKit control-flow values are preserved:

- `redirect(...)`
- `error(...)`
- `fail(...)` / `ActionFailure`

Use `mapError` to translate domain failures at the edge.

```ts
import { error, redirect } from "@sveltejs/kit";
import { Data } from "effect";

class NotFound extends Data.TaggedError("NotFound")<{
  readonly message: string;
}> {}

class NeedsLogin extends Data.TaggedError("NeedsLogin")<{
  readonly next: string;
}> {}

export const runtime = SvelteKitEffectRuntime.make({
  layer: AppLayer,
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
```

Unhandled failures and defects are logged with the full Effect `Cause` and converted to a SvelteKit 500 response.

## API Summary

```ts
const runtime = SvelteKitEffectRuntime.make({
  runtime,
  layer,
  memoMap,
  requestLayer,
  loadLayer,
  remoteLayer,
  remote,
  mapError,
});

runtime.handle(({ event, resolve }) => effect); // resolve is SvelteKit's raw resolver
runtime.handler(effect);
runtime.load(effect);
runtime.actions({ name: effect });
runtime.query(effect);
runtime.query(schema, (input) => effect);
runtime.command(schema, (input) => effect);
runtime.form(effect);
runtime.form("unchecked", (input, issue) => effect);
runtime.form(schema, (input, issue) => effect);

runtime.CurrentRequestEvent;
runtime.CurrentServerLoadEvent;
```

## Notes

- Build one runtime instance per app configuration and reuse it across server modules.
- App-level services live in the shared `ManagedRuntime`.
- Request, load, and remote layers are invocation-local and should hold request-derived services.
- Most wrapper inputs are direct `Effect` values; `handle` and schema-backed remote functions use callbacks when SvelteKit needs to pass hook or validated input.
- Remote functions are still a SvelteKit experimental surface; this library wraps SvelteKit's transport rather than replacing it.

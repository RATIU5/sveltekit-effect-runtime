# SvelteKit Effect Runtime

`sveltekit-effect-runtime` is a runtime-only adapter for using `Effect` in SvelteKit server APIs.

## Install

```sh
pnpm add sveltekit-effect-runtime effect@4.0.0-beta.43
# OR
bun add sveltekit-effect-runtime effect@4.0.0-beta.43
```

**Note**: Update the Effect v4 version to the latest version. Effect 4 is only supported.

You also need a compatible `@sveltejs/kit` project.

## Quick start

Import the wrapper that matches the SvelteKit server surface you are using:

```ts
import { Effect } from "effect";
import { wrapHandler } from "sveltekit-effect-runtime";

export const GET = wrapHandler(Effect.succeed(new Response("ok")));
```

For app-wide configuration, call `configureRuntime(...)` once in `hooks.server.ts`, usually from `wrapInit(...)`.

```ts
// src/hooks.server.ts
import { configureRuntime, wrapInit } from "sveltekit-effect-runtime";

export const init = wrapInit(() => {
  configureRuntime({
    logLevel: "Debug",
  });
});
```

## Supported helpers

- `wrapHandler` for `+server.ts`
- `wrapServerLoad` for `+page.server.ts` and `+layout.server.ts`
- `universalLoad` for `+page.ts` and `+layout.ts`
- `wrapActions` for `actions`
- `wrapHandle`
- `wrapHandleFetch`
- `wrapHandleError`
- `wrapHandleValidationError`
- `wrapInit`

## Usage

```ts
import { Effect } from "effect";
import {
  wrapActions,
  wrapHandler,
  wrapServerLoad,
} from "sveltekit-effect-runtime";

export const GET = wrapHandler(Effect.succeed(new Response("ok")));

export const load = wrapServerLoad(Effect.succeed({ message: "hello" }));

export const actions = wrapActions({
  default: Effect.succeed({ ok: true }),
});
```

Server actions can also use the current request and return `fail(...)` values:

```ts
// src/routes/+page.server.ts
import { fail } from "@sveltejs/kit";
import { Effect } from "effect";
import { SvelteRequest, wrapActions } from "sveltekit-effect-runtime";

export const actions = wrapActions({
  add: Effect.gen(function* () {
    const request = yield* SvelteRequest.SvelteRequest;
    const formData = yield* Effect.promise(() => request.formData());
    const left = Number(formData.get("left"));
    const right = Number(formData.get("right"));

    if (Number.isNaN(left) || Number.isNaN(right)) {
      return yield* Effect.fail(fail(400, { message: "Invalid numbers" }));
    }

    return { total: left + right };
  }),
});
```

Request-scoped services are available inside wrapped request effects:

```ts
import { Effect } from "effect";
import {
  SvelteRequest,
  SvelteResponse,
  wrapHandler,
} from "sveltekit-effect-runtime";

export const GET = wrapHandler(
  Effect.gen(function* () {
    const request = yield* SvelteRequest.SvelteRequest;

    return yield* SvelteResponse.unsafeJson({
      foo: request.method,
    });
  }),
);
```

Server loads work the same way:

```ts
// src/routes/+page.server.ts
import { Effect } from "effect";
import { currentRequestEvent, wrapServerLoad } from "sveltekit-effect-runtime";

export const load = wrapServerLoad(
  currentRequestEvent.pipe(
    Effect.map((event) => ({
      path: event.url.pathname,
    })),
  ),
);
```

Universal loads are supported too. On the server they use the managed runtime; in the browser they run directly with load-scoped services:

```ts
// src/routes/+layout.ts
import { Effect } from "effect";
import { currentLoadEvent, universalLoad } from "sveltekit-effect-runtime";

export const load = universalLoad(
  currentLoadEvent.pipe(
    Effect.map((event) => ({
      routeId: event.route.id,
    })),
  ),
);
```

For hooks:

```ts
import {
  wrapHandle,
  wrapHandleFetch,
  wrapInit,
} from "sveltekit-effect-runtime";

export const init = wrapInit(myInitEffect);
export const handle = wrapHandle(myHandleEffect);
export const handleFetch = wrapHandleFetch(myHandleFetchEffect);
```

You can also install per-request or per-load services through `configureRuntime(...)`:

```ts
import { Effect, Layer, ServiceMap } from "effect";
import {
  configureRuntime,
  currentLoadEvent,
  currentRequestEvent,
} from "sveltekit-effect-runtime";

const RequestPath = ServiceMap.Service<string>("app/RequestPath");
const RouteId = ServiceMap.Service<string | null>("app/RouteId");

configureRuntime({
  requestLayer: Layer.effect(RequestPath)(
    currentRequestEvent.pipe(Effect.map((event) => event.url.pathname)),
  ),
  loadLayer: Layer.effect(RouteId)(
    currentLoadEvent.pipe(Effect.map((event) => event.route.id)),
  ),
});
```

Effect-heavy apps can add request-derived services through `configureRuntime`:

```ts
import {
  configureRuntime,
  currentRequestEvent,
} from "sveltekit-effect-runtime";
import { Effect, Layer, ServiceMap } from "effect";

const RequestPath = ServiceMap.Service<string>("app/RequestPath");

configureRuntime({
  requestLayer: Layer.effect(RequestPath)(
    currentRequestEvent.pipe(Effect.map((event) => event.url.pathname)),
  ),
});
```

## Notes

- Async helpers that resolve to an `Effect` are supported.
- `universalLoad` uses the managed runtime during SSR only. In the browser it runs the provided Effect directly with `currentLoadEvent` and any configured `loadLayer`.
- `requestLayer` and `loadLayer` are evaluated per request/load and can depend on the current SvelteKit event.
- `configureRuntime({ layer })` is for server-side runtime services. Do not rely on it for client-side `universalLoad` navigation.
- Handler, load, and hook failures from `Effect.fail(...)` are propagated back to SvelteKit unchanged. If you want HTTP/status mapping, do that in your Effect program. `wrapActions` also passes through SvelteKit `ActionFailure` values.
- Remote functions are not supported.

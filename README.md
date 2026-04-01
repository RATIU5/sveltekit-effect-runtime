# SvelteKit Effect Runtime

`sveltekit-effect-runtime` is a runtime-only adapter for using `Effect` in SvelteKit server APIs.

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

# SvelteKit Effect Runtime Example

This app demonstrates the bridge across the main SvelteKit server surfaces:

- `src/hooks.server.ts` uses `runtime.handle(...)` with SvelteKit's raw `resolve`
- `src/routes/+page.server.ts` uses `runtime.load(...)` and `runtime.actions(...)`
- `src/routes/test/+server.ts` uses `runtime.handler(...)`
- `src/routes/bridge.remote.ts` uses `runtime.query(...)`, `runtime.command(...)`, and `runtime.form(...)`

Run it from this directory:

```sh
pnpm install
pnpm dev
```

The server hook adds `x-example-request-id` and `x-example-runtime` headers to
responses, using the same request-scoped `RequestMeta` layer as handlers,
actions, and remote functions.

# Example app

This SvelteKit app is a local consumer of `sveltekit-effect-runtime`.

It aliases `sveltekit-effect-runtime` to `../src/index.ts` in [vite.config.js](/Users/john.memmott/Developer/sveltekit-effect-bridge/example/vite.config.js) and [tsconfig.json](/Users/john.memmott/Developer/sveltekit-effect-bridge/example/tsconfig.json), so you can iterate on the library and the example side by side without publishing a package.

## What it demonstrates

- `wrapInit`, `wrapHandle`, `wrapHandleFetch`, `wrapHandleError`, and `wrapHandleValidationError` in `src/hooks.server.ts`
- `wrapServerLoad` in `src/routes/+layout.server.ts` and `src/routes/+page.server.ts`
- `universalLoad` in `src/routes/+layout.ts`
- `wrapActions` in `src/routes/+page.server.ts`
- `wrapHandler`, `SvelteRequest`, and `SvelteResponse` in `src/routes/api/runtime/+server.ts`
- request-scoped and load-scoped runtime layers from `src/lib/demo/services.ts`

## Important note

`wrapHandleValidationError` is a remote-function hook in SvelteKit. This example wires it up in `src/hooks.server.ts`, but the app does not include a remote-function demo because `sveltekit-effect-runtime` intentionally focuses on handlers, loads, actions, and hooks rather than remote-function wrappers.

## Commands

```sh
pnpm dev
pnpm check
pnpm build
```

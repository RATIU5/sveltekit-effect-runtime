# sveltekit-effect-bridge: Validated Implementation Plan

## Verdict

The project is feasible, but the previous plan mixed solid ideas with a few brittle assumptions:

- The current package cannot ship the proposed new entrypoints yet because `package.json` references `tsconfig.build.json`, and that file does not exist.
- The transform currently imports `effect-sveltekit/runtime`, but this repo publishes `sveltekit-effect-bridge`. That import path cannot work unless the package is renamed or a second package is created.
- Patching `.svelte-kit/types/**/$types.d.ts` is possible, but it is inherently race-prone because SvelteKit regenerates those files repeatedly during dev.
- Adapter detection through `__SVELTEKIT_ADAPTER_NAME__` may work, but it is an internal coupling, not a stable foundation to build phase 1 around.
- Injecting and composing `hooks.server.ts:init` is possible, but it is not the simplest path to a reliable first release.

The efficient route is to split the work into a stable core and two optional layers:

1. Ship runtime helpers for server-only exports first.
2. Add the Vite transform as an ergonomic layer after the helpers and tests are solid.
3. Add an opt-in type bridge only if the zero-boilerplate experience is still worth the churn.
4. Treat universal loads and remote functions as later phases, not day-one scope.

## Current Repo Facts

Validated against the repository on March 31, 2026:

- `src/index.ts` only implements `transform`.
- `src/utils.ts` rewrites direct exported bindings via regex and does not correctly handle `export { foo as GET }`.
- `package.json` only exports `"."`.
- `pnpm typecheck` passes.
- `pnpm build` fails because `tsconfig.build.json` is missing.
- `pnpm test` fails because there are no tests.

## Recommended Product Shape

### Package layout

Use a single published package first.

- Keep the package name `sveltekit-effect-bridge`.
- Add a runtime subpath export and emit imports from `sveltekit-effect-bridge/runtime`.
- Do not introduce a separate `effect-sveltekit` package in phase 1.

Reasoning:

- It matches the current repo.
- It avoids monorepo overhead.
- It removes the current impossible import path.

If a second package is still desirable later, that can be a packaging change after the runtime API stabilizes.

### Runtime bootstrap

Use lazy, idempotent runtime initialization in phase 1.

- Provide a runtime singleton such as `getOrCreateRuntime()`.
- Initialize on first wrapped server execution.
- Allow explicit configuration via plugin options and runtime helpers.
- Do not require `hooks.server.ts:init` injection for the first release.

Reasoning:

- It is less brittle than composing user `init`.
- It reduces coupling to SvelteKit lifecycle details.
- It keeps request wrappers usable even when the app has no `hooks.server.ts`.

If eager bootstrap is still needed later, add it as an optimization, not as the only path.

### Type compatibility strategy

There are two viable routes:

#### Preferred stable route

Add typed helper APIs for users who want zero friction in TypeScript without patching generated files.

Examples:

- `serverHandler(effect)`
- `serverLoad(effect)`
- `actions(effectRecord)`

These helpers return SvelteKit-compatible function types and avoid modifying `.svelte-kit/types`.

#### Optional experimental route

Add a generated `$types` patcher as an opt-in feature.

- Use a shared patch module.
- Re-patch on dev watcher events and during build.
- Provide a CLI for manual use.
- Document it as best-effort, not perfectly stable.

Reasoning:

- Generated type patching can work, but it will always be vulnerable to regeneration timing and editor cache quirks.
- The helper API gives users a reliable fallback when they need editor stability more than syntax purity.

## Phase Plan

## Phase 0: Fix Packaging and Delivery Plumbing

This is mandatory before feature work.

- Add `tsconfig.build.json`.
- Make `build` produce `dist/index.js`, `dist/index.d.ts`, and runtime subpath outputs.
- Add runtime subpath export:
  - `"./runtime": { "types": "./dist/runtime/index.d.ts", "import": "./dist/runtime/index.js" }`
- Keep `"."` for the Vite plugin.
- Adjust generated import paths in transforms to `sveltekit-effect-bridge/runtime`.
- Add a minimal test harness so `pnpm test` does not fail by default.

Acceptance criteria:

- `pnpm build` succeeds.
- `pnpm test` runs at least one real test file.
- Published outputs resolve for both plugin and runtime subpath.

## Phase 1: Add the Runtime Subpath and Helper API

This is the fastest route to a usable product.

### Product goal

Users should be able to write code like:

```ts
export const GET = serverHandler(myEffect);
export const load = serverLoad(myLoadEffect);
export const actions = actions(myActionsEffectRecord);
```

without requiring the Vite plugin to rewrite source.

That gives:

- a working runtime story
- explicit, stable TypeScript types
- immediate value even before any transform exists

### Initial runtime modules

- `src/runtime/index.ts`
- `src/runtime/config.ts`
- `src/runtime/managed-runtime.ts`
- `src/runtime/services.ts`
- `src/runtime/server-handler.ts`
- `src/runtime/server-load.ts`
- `src/runtime/actions.ts`
- `src/runtime/handle.ts`

### Initial helper surface

Ship explicit helpers for the server-only cases:

- `serverHandler(...)`
- `serverLoad(...)`
- `actions(...)`
- `handle(...)`

These helpers should:

- expose SvelteKit-compatible types
- perform the runtime wrapping directly
- pass plain functions through unchanged when reasonable

### Runtime rules

- If the value is not an Effect, pass through unchanged.
- If it is an Effect, run it through the shared runtime and map the result into the expected SvelteKit shape.
- Inject request-scoped services explicitly from function arguments, not via AsyncLocalStorage lookups inside Effect fibers.
- Runtime initialization must be lazy and idempotent.

### Configuration

Expose explicit configuration instead of relying on adapter sniffing first.

Example directions:

- plugin option for a runtime layer factory
- runtime helper to register a layer
- explicit override for platform integration

Do not make adapter autodetection a hard dependency for correctness.

Acceptance criteria:

- A user can get value from the package with runtime helpers alone.
- Wrapped server handlers return `Response`.
- Wrapped server loads return plain data.
- Wrapped actions convert Effect failures in a predictable, documented way.
- Runtime initialization is idempotent across repeated requests.

## Phase 2: Harden the Existing Transform Core

Refactor the transform after the helper API is usable and tested.

### Required changes

- Replace the single `__wrapIfEffect` path with a per-export wrapper mapping.
- Fix re-export handling in `buildTransformedCode`.
- Stop relying on regex alone for the re-export case.

Recommended implementation:

- Keep AST-based export discovery.
- Continue string rewriting for direct declarations only.
- For `export { local as GET }` style exports, remove the export statement and emit:
  - `const __original_GET = local;`
  - `export const GET = __wrapServerHandler(__original_GET);`

If the export syntax becomes too varied, move to `magic-string` instead of expanding regex complexity.

### Supported surface for phase 2

Ship only the server-side cases with clear value and low ambiguity:

- `+server.ts` HTTP verbs and `fallback`
- `+page.server.ts` `load`
- `+layout.server.ts` `load`
- `+page.server.ts` `actions`
- `src/hooks.server.ts` `handle`

Defer these until later:

- universal `+page.ts` and `+layout.ts`
- `handleFetch`
- `handleError`
- `handleValidationError`
- remote functions
- bootstrap via `init`

Reasoning:

- Server-only exports are the cleanest fit for Effect runtimes.
- Universal and remote APIs carry extra client/runtime contracts.
- A smaller supported matrix gets tests in place faster.

Acceptance criteria:

- Mixed modules transform correctly.
- Re-exports work.
- Non-target exports remain untouched.
- Files with no relevant exports are unchanged.

## Phase 3: Testing

Add tests before expanding scope.

### Unit tests

- `detectFileType`
- `extractNamedExports`
- `buildTransformedCode`
- helper typing/runtime behavior
- type patch string rewriting if that feature is added

### Transform snapshot tests

Cover:

- direct exported const/function declarations
- `export { foo as GET }`
- multiple wrapped exports in one file
- untouched files
- SSR-only gating behavior

### Runtime tests

Cover:

- plain function passthrough
- Effect execution success path
- Effect failure mapping for actions
- singleton runtime reuse

### Integration tests

Use small fixture apps or fixture source files rather than a full end-to-end app first.

Acceptance criteria:

- `pnpm test` passes locally.
- Build-time transform behavior is asserted in snapshots or equivalent string expectations.

## Phase 4: Optional Type Bridge

Only start this after phases 0 through 3 are solid.

### Implementation

- Add `src/patch-types.ts` with shared file-patching logic.
- Add `configureServer` watcher support.
- Add `buildStart` one-shot patching.
- Add `src/cli/patch-types.ts`.
- Add a `bin` entry.

### Constraints

- The CLI is opt-in. This package cannot silently add a `postinstall` hook to the consuming app.
- Document the consumer setup explicitly if they want postinstall patching.
- Use a sentinel comment for idempotency.
- Use fast string rewriting only.

### Scope

Start with only these aliases:

- `RequestHandler`
- `PageServerLoad`
- `LayoutServerLoad`
- `Action`
- `Actions`

Do not include universal loads in the first patcher pass.

Reasoning:

- Those are the exports phase 1 and phase 2 surface actually support.
- Patching universal load types before universal runtime support creates a correctness gap.

Acceptance criteria:

- Re-running the patcher does not duplicate changes.
- Regenerated files get re-patched during dev.
- Missing `.svelte-kit/types` exits cleanly.

## Phase 5: Universal Loads

Universal loads should be a separate decision, not an incidental add-on.

### Recommendation

Do not support `+page.ts` and `+layout.ts` in phase 1.

If support is added later, choose one of these paths explicitly:

1. SSR-only support
2. Fully client-safe runtime support

The better phase-2 path is usually SSR-only support with clear documentation, but only if the team accepts that client-side navigations cannot rely on raw Effect exports.

If that limitation is unacceptable, keep universal loads out of scope until a browser-safe runtime story exists.

## Phase 6: Hooks Expansion and Remote Functions

These are valid later targets, but they are not the efficient critical path.

### Hooks expansion

After `handle` is stable, add in this order:

1. `init` as optional eager bootstrap
2. `handleFetch`
3. `handleError`
4. `handleValidationError`

### Remote functions

Treat remote functions as a dedicated follow-up feature.

- Their calling and serialization model is distinct.
- They deserve separate tests and docs.
- They should not block the core server-route/runtime release.

## File-Level Change Plan

### Existing files

`src/index.ts`

- Add runtime config plumbing.
- Keep `transform`.
- Add optional `configureServer` and `buildStart` only when the type bridge is implemented.
- Do not add `configResolved` adapter logic in phase 1 unless it is purely advisory.

`src/utils.ts`

- Add wrapper selection mapping support.
- Fix re-export handling.
- Keep AST discovery.
- Consider `magic-string` if rewriting gets more complex.

`src/consts.ts`

- Add wrapper mapping constants.
- Keep export-name sets focused on actually supported file types.

`src/types.ts`

- Add any explicit runtime configuration types.
- Do not widen options around undocumented SvelteKit internals unless necessary.

`package.json`

- Fix build outputs.
- Add runtime subpath export.
- Add `bin` only when the patch CLI exists.

### New files for the stable core

- `tsconfig.build.json`
- `src/runtime/index.ts`
- `src/runtime/config.ts`
- `src/runtime/managed-runtime.ts`
- `src/runtime/services.ts`
- `src/runtime/server-handler.ts`
- `src/runtime/server-load.ts`
- `src/runtime/actions.ts`
- `src/runtime/handle.ts`
- tests under a consistent `test/` or `src/**/*.test.ts` layout

### New files for the optional type bridge

- `src/patch-types.ts`
- `src/cli/patch-types.ts`

## Open Decisions

These should be resolved before implementation starts past phase 2:

1. Is the priority zero-boilerplate syntax, or stable editor/types behavior?
2. Should universal loads be supported at all if the browser runtime story is incomplete?
3. Is adapter autodetection worth the maintenance cost, or should runtime/platform wiring stay explicit?
4. Do you want a single package only, or is there a real reason to split plugin and runtime later?

## Recommended Execution Order

1. Fix build outputs and exports.
2. Implement runtime subpath and helper API for server-only cases.
3. Add tests around helpers and runtime behavior.
4. Refactor transform and add wrapper mapping as an ergonomic layer.
5. Decide whether helper APIs alone are enough for type safety.
6. Only then add the optional `$types` patcher.
7. Expand into universal loads, hooks extras, and remote functions after the core is stable.

## Final Recommendation

Build the stable server-only runtime helpers first, then add the transform as an ergonomic layer, and treat the generated-type patcher as an optional enhancement rather than the foundation of the product.

That route is:

- possible with the current repo
- materially less flaky
- easier to test
- faster to ship

The previous plan was ambitious but too eager to solve every edge in one pass. This version preserves the goal while removing the main structural risks.

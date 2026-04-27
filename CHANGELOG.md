# sveltekit-effect-runtime

## 1.2.0

### Minor Changes

- f342014: updated the handle method to give a resolve function that's not an effect function generator

## 1.1.0

### Minor Changes

- [`aeb57f5`](https://github.com/RATIU5/sveltekit-effect-runtime/commit/aeb57f59c62d84b80b3c6ebcdcaf0ee14d664e52) Thanks [@RATIU5](https://github.com/RATIU5)! - Add new handle method for sveltekit hook server files

## 1.0.0

### Major Changes

- [`a727fd6`](https://github.com/RATIU5/sveltekit-effect-runtime/commit/a727fd61120861c9fdf66a15ae4dfca8734fb028) Thanks [@RATIU5](https://github.com/RATIU5)! - Complete re-write with a focus on a minimal API surface. This includes the following Svelte functions: load, actions, handlers, query, command, and form

## 0.3.1

### Patch Changes

- [`cb48c96`](https://github.com/RATIU5/sveltekit-effect-runtime/commit/cb48c964319f9000b8fb52bdd0cf6ce82e6fbb96) Thanks [@RATIU5](https://github.com/RATIU5)! - Updated the example directory and exclude map files from output

## 0.3.0

### Minor Changes

- Updated Effect v4 to latest, renamed Effect.ServiceMap -> Effect.Context

## 0.2.0

### Minor Changes

- SvelteHandleParams.resolve now returns an Effect<Response>.
  Replace Effect.promise(() => resolve(event)) with yield\* resolve(event).

## 0.1.5

### Patch Changes

- Added the new SvelteHandleParams interface for working with SvelteKit's handle function params

## 0.1.4

### Patch Changes

- Updated the import extensions for files to resolve import errors

## 0.1.3

### Patch Changes

- Update readme effect version

## 0.1.2

### Patch Changes

- Fix the changeset config repository

## 0.1.1

### Patch Changes

- Update readme with install instructions and more examples

## 0.1.0

### Minor Changes

- initial release of the sveltekit-effect-runtime package. This release includes effect wrappers that allow effects to run as SvelteKit actions/request methods/etc.

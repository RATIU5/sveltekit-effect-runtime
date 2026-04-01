/**
 * HTTP verbs recognized by SvelteKit in +server.ts files.
 */
export const SERVER_ROUTE_EXPORTS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
  "fallback",
]);

/**
 * Special exports recognized in +page.server.ts and +layout.server.ts.
 */
export const SERVER_LOAD_EXPORTS = new Set(["load", "actions"]);

/**
 * Special exports recognized in hooks.server.ts.
 */
export const HOOKS_SERVER_EXPORTS = new Set([
  "init",
  "handle",
  "handleFetch",
  "handleError",
  "handleValidationError",
]);

/**
 * Special exports recognized in +page.ts and +layout.ts (universal load).
 */
export const UNIVERSAL_LOAD_EXPORTS = new Set(["load"]);

/**
 * Special exports recognized in *.remote.ts files.
 */
export const REMOTE_EXPORTS = new Set([
  "query",
  "form",
  "command",
  "prerender",
]);

// oxlint-disable max-statements
import type { Program } from "estree";

import {
  HOOKS_SERVER_EXPORTS,
  REMOTE_EXPORTS,
  SERVER_LOAD_EXPORTS,
  SERVER_ROUTE_EXPORTS,
  UNIVERSAL_LOAD_EXPORTS,
} from "./consts";

import type { DetectedExport, SvelteKitFileType } from "./types";

const detectCleanFileType = (filename: string): SvelteKitFileType => {
  if (/^\+server\.(ts|js)$/.test(filename)) {
    return "server-route";
  } else if (/^\+page\.server\.(ts|js)$/.test(filename)) {
    return "page-server";
  } else if (/^\+layout\.server\.(ts|js)$/.test(filename)) {
    return "layout-server";
  } else if (/^\+page\.(ts|js)$/.test(filename)) {
    return "page-universal";
  } else if (/^\+layout\.(ts|js)$/.test(filename)) {
    return "layout-universal";
  } else if (/^hooks\.server\.(ts|js)$/.test(filename)) {
    return "hooks-server";
  } else if (/^hooks\.client\.(ts|js)$/.test(filename)) {
    return "hooks-client";
  } else if (/^hooks\.(ts|js)$/.test(filename)) {
    return "hooks-shared";
  } else if (/\.remote\.(ts|js)$/.test(filename)) {
    return "remote";
  }
  return undefined;
};

// Turn `export const FOO = ...` into `const __original_FOO = ...` by
// Removing the `export` keyword and renaming the binding so the wrapper
// Can re-export under the original name without a duplicate declaration.
const renameExportedBindings = (
  originalCode: string,
  allTargeted: Array<DetectedExport>,
): string => {
  let mutatedCode = originalCode;
  for (const e of allTargeted) {
    mutatedCode = mutatedCode
      .replaceAll(
        new RegExp(`\\bexport\\s+(const|let|var)\\s+(${e.name})\\b`, "g"),
        `$1 __original_$2`,
      )
      .replaceAll(
        new RegExp(`\\bexport\\s+(async\\s+)?function\\s+(${e.name})\\b`, "g"),
        `$1function __original_$2`,
      );
  }
  return mutatedCode;
};

export const detectFileType = (id: string): SvelteKitFileType => {
  // Normalize to forward slashes and strip query strings
  // (Vite appends ?v=... etc.)
  const clean = id.replace(/\?.*$/, "").replaceAll("\\", "/");

  // Ignore node_modules and .svelte-kit generated output
  if (clean.includes("node_modules") || clean.includes(".svelte-kit/output")) {
    return undefined;
  }

  // Must be inside src/ to be a SvelteKit authored file
  if (!clean.includes("/src/")) {
    return undefined;
  }

  const filename = clean.split("/").pop() ?? "";

  return detectCleanFileType(filename);
};

export const getTargetExports = (
  fileType: SvelteKitFileType,
): Set<string> | undefined => {
  switch (fileType) {
    case "server-route": {
      return SERVER_ROUTE_EXPORTS;
    }
    case "page-server":
    case "layout-server": {
      return SERVER_LOAD_EXPORTS;
    }
    case "page-universal":
    case "layout-universal": {
      return UNIVERSAL_LOAD_EXPORTS;
    }
    case "hooks-server": {
      return HOOKS_SERVER_EXPORTS;
    }
    case "remote": {
      return REMOTE_EXPORTS;
    }

    // Hooks-client, hooks-shared intentionally excluded —
    // Wrapping client-side hooks with Effect.runPromise is out of scope.
    case "hooks-client":
    case "hooks-shared":
    case undefined: {
      return undefined;
    }
  }
};

/**
 * Parse the module source and return all top-level named exports, along with
 * a best-effort guess at whether each one is already a plain function.
 *
 * We use Rollup's built-in parser (via `this.parse`) so we don't need an
 * extra dependency. The caller passes in the parsed Program node.
 */
export const extractNamedExports = (ast: Program): Array<DetectedExport> => {
  const exports: Array<DetectedExport> = [];

  for (const node of ast.body) {
    if (node.type !== "ExportNamedDeclaration") {
      // oxlint-disable-next-line no-continue
      continue;
    }

    const exportNode = node;

    // Case 1: export function foo() {}
    if (
      exportNode.declaration?.type === "FunctionDeclaration" &&
      exportNode.declaration.id !== undefined
    ) {
      exports.push({
        name: exportNode.declaration.id.name,
        isLikelyFunction: true,
      });
    } else if (exportNode.declaration?.type === "VariableDeclaration") {
      // Case 2: export const foo = ...
      for (const declarator of exportNode.declaration.declarations) {
        if (declarator.id.type === "Identifier") {
          const { name } = declarator.id;

          // If the initializer is an expression or arrow function, it's almost certainly already a handler. Flag to skip the runtime guard injection if desired.
          const isLikelyFunction =
            declarator.init?.type === "FunctionExpression" ||
            declarator.init?.type === "ArrowFunctionExpression";

          exports.push({ name, isLikelyFunction });
        }
      }
    } else {
      // Case 3: export { foo, bar as baz } — re-exports from this module
      for (const specifier of exportNode.specifiers) {
        if (specifier.exported.type === "Identifier") {
          exports.push({
            name: specifier.exported.name,
            isLikelyFunction: false,
          });
        }
      }
    }
  }

  return exports;
};

/**
 * Build the injected runtime preamble and per-export wrapper stubs.
 *
 * Strategy:
 *   1. Import the Effect runtime adapter from our package at the top.
 *   2. For each target export that might be an Effect, replace the export
 *      binding with a runtime-guarded wrapper.
 *
 * The wrapper:
 *   - Calls Effect.isEffect(originalValue) at runtime.
 *   - If true: wraps it in a SvelteKit-compatible async function that
 *       provisions request context, runs the Effect, converts the
 *       HttpServerResponse to a web Response.
 *   - If false: passes the original value through untouched.
 *
 * This means zero overhead for any file that doesn't actually use Effects.
 */
export const buildTransformedCode = ({
  originalCode,
  fileType,
  detectedExports,
  targetExports,
}: {
  originalCode: string;
  fileType: SvelteKitFileType;
  detectedExports: Array<DetectedExport>;
  targetExports: Set<string>;
}): string => {
  const allTargeted = detectedExports.filter((e) => targetExports.has(e.name));

  if (allTargeted.length === 0) {
    // Nothing to transform in this file.
    return originalCode;
  }

  const wrapperImport = `import { __wrapIfEffect } from "effect-sveltekit/runtime";`;
  const fileTypeComment = `/* effect-sveltekit: transforming ${fileType} */`;

  // For each targeted export, we:
  //   1. Rename the original binding from `NAME` to `__original_NAME`
  //      (done by renameExportedBindings on the original source).
  //   2. Re-export a wrapped version under the original name.
  //
  // We use string manipulation rather than full AST rewriting to keep the
  // Implementation simple and debuggable.
  const wrapperStatements = allTargeted
    .map(
      (e) =>
        `export const ${e.name} = __wrapIfEffect(__original_${e.name}, "${e.name}", "${fileType}");`,
    )
    .join("\n\n");

  const mutatedCode = renameExportedBindings(originalCode, allTargeted);

  return [fileTypeComment, wrapperImport, mutatedCode, wrapperStatements].join(
    "\n\n",
  );
};

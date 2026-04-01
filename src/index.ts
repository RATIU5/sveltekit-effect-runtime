// oxlint-disable max-statements max-lines-per-function
import type { Program } from "estree";
import type { Plugin, TransformResult } from "vite";

import {
  buildTransformedCode,
  detectFileType,
  extractNamedExports,
  getTargetExports,
} from "./utils";

import type {
  EffectSvelteKitOptions as SvelteKitEffectOptions,
  SvelteKitFileType,
} from "./types";

/**
 * Determine whether a file should be transformed and, if so, return its
 * file type and the set of exports we care about.
 */
const resolveTransformTarget = (
  id: string,
  isSSREnvironment: boolean,
  include: Array<SvelteKitFileType> | undefined,
):
  | { fileType: NonNullable<SvelteKitFileType>; targetExports: Set<string> }
  | undefined => {
  const fileType = detectFileType(id);
  if (fileType === undefined) {
    return undefined;
  }

  if (include && !include.includes(fileType)) {
    return undefined;
  }

  // Server-only files must only be transformed in the SSR environment.
  // Universal loads (+page.ts, +layout.ts) run in both, so they pass through always.
  const serverOnlyTypes: ReadonlySet<string> = new Set([
    "server-route",
    "page-server",
    "layout-server",
    "hooks-server",
    "remote",
  ]);
  if (serverOnlyTypes.has(fileType) && !isSSREnvironment) {
    return undefined;
  }

  const targetExports = getTargetExports(fileType);
  if (!targetExports || targetExports.size === 0) {
    return undefined;
  }

  return { fileType, targetExports };
};

/**
 * Parse the module and return the detected exports that match our target
 * set, or `undefined` if none match.
 */
const findRelevantExports = (
  code: string,
  targetExports: Set<string>,
  parse: (code: string) => unknown,
): ReturnType<typeof extractNamedExports> | undefined => {
  let ast: Program | undefined = undefined;
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    ast = parse(code) as Program;
  } catch {
    return undefined;
  }

  const detectedExports = extractNamedExports(ast);

  const relevantExports = detectedExports.filter((e) =>
    targetExports.has(e.name),
  );

  if (relevantExports.length === 0) {
    return undefined;
  }

  return detectedExports;
};

const transformFn = ({
  log,
  include,
}: {
  log: (msg: string) => void;
  include: Array<SvelteKitFileType> | undefined;
}) =>
  function transformHandler(
    this: { environment?: { name: string }; parse: (code: string) => unknown },
    code: string,
    id: string,
  ): TransformResult | undefined {
    const env = this.environment?.name ?? "unknown";
    const isSSREnvironment =
      env === "ssr" || env === "server" || env === "unknown";

    const target = resolveTransformTarget(id, isSSREnvironment, include);
    if (!target) {
      return undefined;
    }

    const { fileType, targetExports } = target;
    log(`Candidate file detected: ${id} (${fileType})`);

    const detectedExports = findRelevantExports(
      code,
      targetExports,
      this.parse.bind(this),
    );
    if (!detectedExports) {
      log(`No target exports found in ${id}, skipping`);
      return undefined;
    }

    log(
      `Wrapping exports [${detectedExports
        .filter((e) => targetExports.has(e.name))
        .map((e) => e.name)
        .join(", ")}] in ${id}`,
    );

    return {
      code: buildTransformedCode({
        originalCode: code,
        fileType,
        detectedExports,
        targetExports,
      }),
      // oxlint-disable-next-line unicorn/no-null -- Vite's TransformResult requires null
      map: null,
    };
  };

const plugin = (options: SvelteKitEffectOptions = {}): Plugin => {
  const { include, debug = false } = options;

  const log = debug
    ? (msg: string) => {
        // oxlint-disable-next-line no-console
        console.log(`[vite-plugin-sveltekit-effect-bridge] ${msg}`);
      }
    : () => {};

  return {
    name: "vite-plugin-sveltekit-effect-bridge",

    // Run before SvelteKit's own plugin so our transforms land first
    enforce: "pre",

    transform: transformFn({
      log,
      include,
    }),
  };
};

export default plugin;

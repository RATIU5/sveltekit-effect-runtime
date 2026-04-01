/* oxlint-disable eslint-plugin-import/no-nodejs-modules */
import adapter from "@sveltejs/adapter-auto";
import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  compilerOptions: {
    // Defaults to rune mode for the project, except for `node_modules`. Can be removed in Svelte 6.
    runes: ({ filename }) => {
      const relativePath = relative(import.meta.dirname, filename);
      const pathSegments = relativePath.toLowerCase().split(sep);
      const isExternalLibrary = pathSegments.includes("node_modules");

      return isExternalLibrary ? undefined : true;
    },
  },
  kit: {
    alias: {
      "sveltekit-effect-runtime": fileURLToPath(
        new URL("../src/index.ts", import.meta.url),
      ),
    },
    // Adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
    // If your environment is not supported, or you settled on a specific environment, switch out the adapter.
    // See https://svelte.dev/docs/kit/adapters for more information about adapters.
    adapter: adapter(),
  },
};

export default config;

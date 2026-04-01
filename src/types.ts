export type SvelteKitFileType =
  | "server-route"
  | "page-server"
  | "layout-server"
  | "page-universal"
  | "layout-universal"
  | "hooks-server"
  | "hooks-client"
  | "hooks-shared"
  | "remote"
  | undefined;

export interface DetectedExport {
  name: string;
  /** Whether the export is a plain function declaration (no wrapping needed) */
  isLikelyFunction: boolean;
}

export interface EffectSvelteKitOptions {
  /**
   * Restrict transform to only specific file types.
   * Defaults to all SvelteKit special file types.
   */
  include?: Array<SvelteKitFileType>;

  /**
   * Log transform decisions to the console during dev.
   * Useful for debugging which files and exports are being wrapped.
   */
  debug?: boolean;
}

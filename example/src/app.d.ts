import "@sveltejs/kit";

// See https://svelte.dev/docs/kit/types#app.d.ts
// For information about these interfaces.
declare global {
  namespace App {
    interface Error {
      message: string;
      detail?: string;
      requestId?: string;
    }
    interface Locals {
      requestId: string;
      userAgent: string;
    }
    // Interface PageData {}
    // Interface PageState {}
    // Interface Platform {}
  }
}

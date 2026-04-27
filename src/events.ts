import type { RequestEvent, ServerLoadEvent } from "@sveltejs/kit";

import { Context } from "effect";

export class CurrentRequestEvent extends Context.Service<
  CurrentRequestEvent,
  RequestEvent
>()("sveltekit-effect-runtime/CurrentRequestEvent") {}

export class CurrentServerLoadEvent extends Context.Service<
  CurrentServerLoadEvent,
  ServerLoadEvent
>()("sveltekit-effect-runtime/CurrentServerLoadEvent") {}

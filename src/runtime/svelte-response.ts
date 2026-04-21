import { Effect } from "effect";

export const SvelteResponse = {
  unsafeJson: (data: unknown, init?: ResponseInit): Effect.Effect<Response> =>
    Effect.succeed(Response.json(data, init)),
  unsafeText: (body: string, init?: ResponseInit): Effect.Effect<Response> =>
    Effect.succeed(new Response(body, init)),
  unsafeResponse: (response: Response): Effect.Effect<Response> =>
    Effect.succeed(response),
} as const;

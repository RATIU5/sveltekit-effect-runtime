import { RequestMeta, runtime } from "$lib";
import * as Effect from "effect/Effect";

export const handle = runtime.handle(({ event, resolve }) =>
  Effect.gen(function* () {
    const request = yield* RequestMeta.asEffect();
    const response = yield* resolve(event, {
      filterSerializedResponseHeaders: (name) =>
        name === "x-example-request-id",
    });
    const writableResponse = new Response(response.body, response);

    writableResponse.headers.set("x-example-request-id", request.requestId);
    writableResponse.headers.set("x-example-runtime", request.appName);

    return writableResponse;
  }),
);

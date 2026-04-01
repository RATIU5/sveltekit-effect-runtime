import { ExampleRequestContext } from "$lib/demo/services";
import { fail, type RequestEvent } from "@sveltejs/kit";
import { Effect } from "effect";
import {
  SvelteRequest,
  currentRequestEvent,
  wrapActions,
  wrapServerLoad,
} from "sveltekit-effect-runtime";

import type { Actions, PageServerLoad } from "./$types";

const parseNumber = (value: FormDataEntryValue | null): number =>
  Number.parseFloat(typeof value === "string" ? value : "0");

const readFormData = (event: RequestEvent) =>
  Effect.promise(() => event.request.formData());

const readAddInputs = (event: RequestEvent) =>
  readFormData(event).pipe(
    Effect.map((formData) => ({
      formData,
      left: parseNumber(formData.get("left")),
      right: parseNumber(formData.get("right")),
    })),
  );

const failInvalidAddInput = (formData: FormData) =>
  Effect.gen(function* () {
    yield* Effect.logWarning("add-action:invalid-input", {
      left: formData.get("left"),
      right: formData.get("right"),
    });

    return yield* Effect.fail(
      fail(400, {
        message: "Both values must be valid numbers.",
        type: "sum",
      }),
    );
  });

export const load: PageServerLoad = wrapServerLoad(
  Effect.gen(function* () {
    const requestContext = yield* ExampleRequestContext;
    const event = yield* currentRequestEvent;
    const request = yield* SvelteRequest.SvelteRequest;

    return {
      serverDemo: {
        method: request.method,
        path: event.url.pathname,
        requestId: requestContext.requestId,
        userAgent: requestContext.userAgent,
      },
    };
  }),
);

export const actions: Actions = wrapActions({
  add: (event) =>
    Effect.gen(function* () {
      const requestContext = yield* ExampleRequestContext;
      const request = yield* SvelteRequest.SvelteRequest;
      yield* Effect.logInfo("add-action:start", {
        path: requestContext.path,
        requestId: requestContext.requestId,
      });

      const { formData, left, right } = yield* readAddInputs(event);
      yield* Effect.logDebug("add-action:parsed-values", {
        left,
        right,
        method: request.method,
      });

      if (Number.isNaN(left) || Number.isNaN(right)) {
        return yield* failInvalidAddInput(formData);
      }

      yield* Effect.logInfo("add-action:success", {
        requestId: requestContext.requestId,
        total: left + right,
      });

      return {
        requestId: requestContext.requestId,
        total: left + right,
        type: "sum",
      };
    }),
  shout: (event) =>
    Effect.gen(function* () {
      const requestContext = yield* ExampleRequestContext;
      yield* Effect.logInfo("shout-action:start", {
        path: requestContext.path,
        requestId: requestContext.requestId,
      });
      const formData = yield* readFormData(event);
      const phraseEntry = formData.get("phrase");
      const phrase = typeof phraseEntry === "string" ? phraseEntry.trim() : "";

      if (phrase.length === 0) {
        return yield* Effect.fail(
          fail(400, {
            message: "Enter a phrase before submitting.",
            type: "shout",
          }),
        );
      }

      yield* Effect.logInfo("shout-action:success", {
        echoed: phrase.toUpperCase(),
        requestId: requestContext.requestId,
      });

      return {
        echoed: phrase.toUpperCase(),
        requestId: requestContext.requestId,
        type: "shout",
      };
    }),
});

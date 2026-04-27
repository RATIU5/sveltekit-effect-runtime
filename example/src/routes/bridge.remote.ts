import type { RemoteFormInput } from "@sveltejs/kit";
import * as Effect from "effect/Effect";

import {
  DemoStore,
  RequestMeta,
  nonEmptyStringSchema,
  numberSchema,
  runtime,
} from "$lib";

type NoteInput = RemoteFormInput & {
  readonly message?: string;
};

const saveNote = (input: NoteInput) =>
  Effect.gen(function* () {
    const request = yield* RequestMeta.asEffect();
    const store = yield* DemoStore.asEffect();
    const message = (input.message ?? "").trim();

    if (message.length === 0) {
      return {
        notes: yield* store.snapshot().pipe(Effect.map((_) => _.notes)),
        requestId: request.requestId,
      };
    }

    const notes = yield* store.saveNote(message);
    return {
      notes,
      requestId: request.requestId,
    };
  });

export const getRemoteSnapshot = runtime.query(
  Effect.gen(function* () {
    const request = yield* RequestMeta.asEffect();
    const store = yield* DemoStore.asEffect();
    const snapshot = yield* store.snapshot();
    return {
      request,
      snapshot,
    };
  }),
);

export const getGreeting = runtime.query(nonEmptyStringSchema, (name) =>
  Effect.gen(function* () {
    const request = yield* RequestMeta.asEffect();
    return {
      greeting: `Hello ${name}`,
      requestPath: request.path,
      requestId: request.requestId,
    };
  }),
);

export const incrementRemoteCounter = runtime.command(numberSchema, (amount) =>
  Effect.gen(function* () {
    const request = yield* RequestMeta.asEffect();
    const store = yield* DemoStore.asEffect();
    const counter = yield* store.increment(amount);
    return {
      counter,
      requestId: request.requestId,
    };
  }),
);

export const saveRemoteNote = runtime.form("unchecked", saveNote);

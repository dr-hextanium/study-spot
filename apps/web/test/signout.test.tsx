import type { SpotList } from "@perch/core";
import { persistQueryClientSave } from "@tanstack/react-query-persist-client";
import { expect, test } from "vitest";
import { surveySpotFixture } from "../../../packages/core/test/fixtures/survey-spot.ts";
import { POWER, SPOT_A } from "../../../packages/ui-logic/test/builders.ts";
import { keys } from "../src/app/keys.ts";
import { shouldPersistQuery } from "../src/app/serverCache.ts";
import { ME, summary, testApp } from "./harness.tsx";

const power = { kind: "spot.section", spot_id: SPOT_A, payload: POWER } as const;
const PERSIST_KEY = "query:survey";

test("signOut stops sending, empties both caches and the session, and keeps queued writes", async () => {
  const spot = surveySpotFixture({ id: SPOT_A, version: 3 });
  const app = testApp({ spots: [spot] });
  const { deps } = app;
  await deps.started;
  app.network.set(false);
  await deps.outbox.enqueue(power, 3);
  await deps.persister.restoreClient();
  const list: SpotList = { term: null, spots: [summary(spot)] };
  deps.queryClient.setQueryData(keys.list, list);
  await persistQueryClientSave({
    queryClient: deps.queryClient,
    persister: deps.persister,
    dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
  });
  expect(await app.cache.get(PERSIST_KEY)).not.toBeNull();

  await deps.signOut();
  app.network.set(true);
  await deps.outbox.idle();

  expect(app.server.inner.requests).toEqual([]);
  expect(await app.cache.get(PERSIST_KEY)).toBeNull();
  expect(deps.queryClient.getQueryCache().getAll()).toEqual([]);
  expect(deps.session.current()).toBeNull();
  await deps.outbox.reload();
  expect(deps.outbox.getSnapshot().records).toHaveLength(1);
});

test("signing in again after signOut starts the outbox and sends the kept write", async () => {
  const spot = surveySpotFixture({ id: SPOT_A, version: 3 });
  const app = testApp({ spots: [spot] });
  const { deps } = app;
  await deps.started;
  app.network.set(false);
  await deps.outbox.enqueue(power, 3);
  await deps.signOut();
  app.network.set(true);
  deps.session.save({ token: "c".repeat(43), surveyor: ME });
  await new Promise((r) => setTimeout(r, 0));
  await deps.outbox.idle();
  expect(app.server.inner.requests.map((r) => r.method)).toEqual(["PUT"]);
});

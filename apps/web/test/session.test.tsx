import { createSessionStore } from "@study-spot/ui-logic";
import { expect, test } from "vitest";
import { MemoryStorage } from "../../../packages/ui-logic/test/fakes.ts";
import { createSessionState } from "../src/app/sessionState.ts";
import { ME, TOKEN } from "./harness.tsx";

test("a session the storage refuses is reported, not thrown, and not kept", () => {
  const storage = new MemoryStorage();
  storage.setItem = () => {
    throw new DOMException("quota", "QuotaExceededError");
  };
  const state = createSessionState(createSessionStore(storage));
  expect(state.save({ token: TOKEN, surveyor: ME })).toBe(false);
  expect(state.current()).toBeNull();
});

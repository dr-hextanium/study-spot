import { expect, test } from "bun:test";
import { slotIndex } from "@perch/core";
import { assembleBusyness, NO_DATA_RATIO } from "../src/bundle/busyness.ts";

const SPOT = "8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a11";

test("measured forecast beats estimate beats no data", () => {
  const b = assembleBusyness(
    [{ spot_id: SPOT, profile: "regular", day_of_week: 1, hour: 14, ratio: 0.7 }],
    [
      {
        id: "e1",
        spot_id: SPOT,
        day_type: "weekday",
        block: "afternoon",
        bucket: "filling",
        surveyor_id: "s",
        created_at: new Date("2026-10-01T00:00:00Z"),
      },
    ],
  );
  expect(b.regular[slotIndex(1, 14)]).toBe(0.7);
  expect(b.confidence[slotIndex(1, 14)]).toBe("measured");
  expect(b.regular[slotIndex(1, 15)]).toBe(0.6);
  expect(b.confidence[slotIndex(1, 15)]).toBe("estimated");
  expect(b.regular[slotIndex(1, 3)]).toBe(NO_DATA_RATIO);
  expect(b.confidence[slotIndex(1, 3)]).toBe("none");
  expect(b.regular[slotIndex(5, 14)]).toBe(NO_DATA_RATIO);
  expect(b.exam).toBeNull();
});

test("latest estimate per cell wins", () => {
  const b = assembleBusyness(
    [],
    [
      {
        id: "old",
        spot_id: SPOT,
        day_type: "weekend",
        block: "evening",
        bucket: "full",
        surveyor_id: "s",
        created_at: new Date("2026-10-01T00:00:00Z"),
      },
      {
        id: "new",
        spot_id: SPOT,
        day_type: "weekend",
        block: "evening",
        bucket: "empty",
        surveyor_id: "s",
        created_at: new Date("2026-10-02T00:00:00Z"),
      },
    ],
  );
  expect(b.regular[slotIndex(6, 19)]).toBe(0.1);
});

test("exam profile is filled from regular where exam slots are missing", () => {
  const b = assembleBusyness(
    [
      { spot_id: SPOT, profile: "regular", day_of_week: 0, hour: 10, ratio: 0.5 },
      { spot_id: SPOT, profile: "exam", day_of_week: 0, hour: 11, ratio: 0.9 },
    ],
    [],
  );
  expect(b.exam?.[slotIndex(0, 11)]).toBe(0.9);
  expect(b.exam?.[slotIndex(0, 10)]).toBe(0.5);
  expect(b.exam).toHaveLength(168);
});

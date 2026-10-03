import { expect, test } from "bun:test";
import { blockOfHour, dayTypeOf, SLOTS, slotIndex } from "../src/index.ts";

test("slot index is dow * 24 + hour, Monday first", () => {
  expect(SLOTS).toBe(168);
  expect(slotIndex(0, 0)).toBe(0);
  expect(slotIndex(1, 14)).toBe(38);
  expect(slotIndex(6, 23)).toBe(167);
});

test("slot index rejects out of range input", () => {
  expect(() => slotIndex(7, 0)).toThrow(RangeError);
  expect(() => slotIndex(0, 24)).toThrow(RangeError);
  expect(() => slotIndex(-1, 0)).toThrow(RangeError);
  expect(() => slotIndex(0.5, 0)).toThrow(RangeError);
});

test("day type", () => {
  expect(dayTypeOf(0)).toBe("weekday");
  expect(dayTypeOf(4)).toBe("weekday");
  expect(dayTypeOf(5)).toBe("weekend");
  expect(dayTypeOf(6)).toBe("weekend");
});

test("time blocks: morning 6-11, afternoon 12-16, evening 17-21, night 22-5", () => {
  expect(blockOfHour(5)).toBe("night");
  expect(blockOfHour(6)).toBe("morning");
  expect(blockOfHour(11)).toBe("morning");
  expect(blockOfHour(12)).toBe("afternoon");
  expect(blockOfHour(16)).toBe("afternoon");
  expect(blockOfHour(17)).toBe("evening");
  expect(blockOfHour(21)).toBe("evening");
  expect(blockOfHour(22)).toBe("night");
  expect(blockOfHour(0)).toBe("night");
});

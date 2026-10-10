import { expect, test } from "bun:test";
import { AccessProfile, accessFor, DEFAULT_ACCESS, scopeKey } from "../../src/index.ts";
import { makeScoringBundle, SPOT } from "../fixtures/scoring-bundle.ts";

const b = makeScoringBundle();
const get = (id: string) => {
  const s = b.spots.find((x) => x.id === id);
  if (s === undefined) throw new Error(id);
  return s;
};

test("scope keys normalize free text", () => {
  expect(scopeKey("  Kelly Quad ")).toBe("kelly-quad");
  expect(scopeKey("Roth (Quad)")).toBe("roth-quad");
});

test("default profile: all-students open, residents and grad locked, unverified flagged", () => {
  expect(accessFor(get(SPOT.carrels), DEFAULT_ACCESS, b.buildings)).toEqual({ kind: "open" });
  expect(accessFor(get(SPOT.kelly), DEFAULT_ACCESS, b.buildings)).toEqual({
    kind: "locked",
    eligibility: "residents_quad",
    scope: "Kelly Quad",
  });
  expect(accessFor(get(SPOT.grad), DEFAULT_ACCESS, b.buildings).kind).toBe("locked");
  expect(accessFor(get(SPOT.unverified), DEFAULT_ACCESS, b.buildings)).toEqual({
    kind: "unverified",
  });
});

test("a matching quad or grad flag unlocks; a department is always locked", () => {
  const p = { residence: null, quad: "kelly-quad", grad: true };
  expect(accessFor(get(SPOT.kelly), p, b.buildings)).toEqual({ kind: "open" });
  expect(accessFor(get(SPOT.grad), p, b.buildings)).toEqual({ kind: "open" });
  const dept = {
    ...get(SPOT.carrels),
    eligibility: "department" as const,
    eligibility_scope: "CS",
  };
  expect(accessFor(dept, p, b.buildings).kind).toBe("locked");
  // A residents spot that is not verified stays unpickable even when it matches
  const kellyUnverified = { ...get(SPOT.kelly), eligibility_verified: false };
  expect(accessFor(kellyUnverified, p, b.buildings)).toEqual({ kind: "unverified" });
});

test("profile schema rejects junk", () => {
  expect(AccessProfile.safeParse({ residence: 3, quad: null, grad: false }).success).toBe(false);
  expect(AccessProfile.safeParse(DEFAULT_ACCESS).success).toBe(true);
});

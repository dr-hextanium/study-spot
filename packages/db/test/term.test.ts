import { expect, test } from "bun:test";
import { pickTerm } from "../src/bundle/term.ts";

const t = (id: string, starts: string, ends: string) => ({
  id,
  campus_id: "sbu",
  name: id,
  starts,
  ends,
  exam_starts: null,
  exam_ends: null,
});
const terms = [t("fall", "2026-08-24", "2026-12-19"), t("spring", "2027-01-25", "2027-05-21")];

test("picks the term containing today, inclusive", () => {
  expect(pickTerm(terms, "2026-10-13")?.id).toBe("fall");
  expect(pickTerm(terms, "2026-08-24")?.id).toBe("fall");
  expect(pickTerm(terms, "2026-12-19")?.id).toBe("fall");
});

test("between terms picks the next upcoming term", () => {
  expect(pickTerm(terms, "2027-01-02")?.id).toBe("spring");
});

test("after the last term returns null", () => {
  expect(pickTerm(terms, "2027-06-01")).toBeNull();
});

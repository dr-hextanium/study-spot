import { expect, test } from "bun:test";
import { surveySpotFixture } from "../../core/test/fixtures/survey-spot.ts";
import {
  failureView,
  fieldLabel,
  fieldList,
  publishWarningText,
  t,
  type WriteError,
} from "../src/index.ts";

const err = (over: Partial<WriteError>): WriteError => ({
  status: 422,
  code: null,
  message: null,
  missing: [],
  ...over,
});

test("field names come from the copy deck", () => {
  expect(fieldLabel("seat_count")).toBe("Seats");
  expect(fieldList(["directions", "food_policy"])).toBe("How to get there, Food and drink");
});

test("a publish refused as incomplete lists the missing fields and can be retried", () => {
  const view = failureView(err({ code: "incomplete", missing: ["directions", "seat_count"] }));
  expect(view).toEqual({ message: "Still missing: How to get there, Seats", canRetry: true });
});

test("an unreadable photo can be retried", () => {
  expect(failureView(err({ status: 0, code: "photo_unreadable" })).canRetry).toBe(true);
});

test("local failures that can never succeed hide retry", () => {
  for (const code of ["photo_missing", "bad_response", "no_base_version"]) {
    expect(failureView(err({ status: 0, code })).canRetry).toBe(false);
  }
  expect(failureView(err({ status: 422, code: "write_id_reused" })).canRetry).toBe(false);
});

test("server messages are never shown; codes and statuses map to deck copy", () => {
  const zod = err({
    status: 400,
    code: "invalid_request",
    message: "\u2716 Invalid input at data.x",
  });
  expect(failureView(zod).message).toBe(t("failed.reason.invalid_request"));
  expect(failureView(err({ status: 403 })).message).toBe(t("failed.reason.forbidden"));
  expect(failureView(err({ status: 404 })).message).toBe(t("failed.reason.not_found"));
  expect(failureView(err({ status: 422, code: "slug_taken", message: "Another" })).message).toBe(
    t("failed.reason.slug_taken"),
  );
  expect(failureView(err({ status: 418 })).message).toBe(t("error.generic"));
  expect(failureView(null).message).toBe(t("error.generic"));
});

test("publisher warnings are reworded with the spot name and field names", () => {
  const spot = surveySpotFixture({ slug: "sac-lounge", official_name: "SAC Lounge" });
  const spots = [
    {
      ...spot,
      building_name: "SAC",
      oldest_verified_at: null,
      hours_confirmed: true,
    },
  ];
  expect(publishWarningText("skipped sac-lounge: missing directions, seat_count", spots)).toBe(
    "SAC Lounge: missing How to get there, Seats",
  );
  expect(publishWarningText("skipped sac-lounge hours day 2: invalid closes", spots)).toBe(
    "SAC Lounge: has hours the student app can't read",
  );
  expect(publishWarningText("skipped other-spot: invalid seat_count", spots)).toBe(
    "other-spot: has a value the student app can't use",
  );
  expect(publishWarningText("something new", spots)).toBe("something new");
});

import { expect, test } from "vitest";
import { parseWebEnv } from "../src/env.ts";

test("both deploy variables are required and lose a trailing slash", () => {
  const ok = parseWebEnv({
    VITE_API_BASE_URL: "https://perch-api.onrender.com/",
    VITE_DATA_BASE_URL: "https://perch-data.pages.dev",
  });
  expect(ok).toEqual({
    ok: true,
    env: {
      VITE_API_BASE_URL: "https://perch-api.onrender.com",
      VITE_DATA_BASE_URL: "https://perch-data.pages.dev",
      VITE_PICK_PING: "0",
    },
  });
  expect(parseWebEnv({ VITE_API_BASE_URL: "https://x.example" }).ok).toBe(false);
  expect(
    parseWebEnv({ VITE_API_BASE_URL: "ftp://x", VITE_DATA_BASE_URL: "https://y.example" }).ok,
  ).toBe(false);
});

test("VITE_PICK_PING is off by default and accepts only 0 or 1", () => {
  const base = { VITE_API_BASE_URL: "https://a.example", VITE_DATA_BASE_URL: "https://b.example" };
  const on = parseWebEnv({ ...base, VITE_PICK_PING: "1" });
  expect(on.ok && on.env.VITE_PICK_PING).toBe("1");
  expect(parseWebEnv({ ...base, VITE_PICK_PING: "yes" }).ok).toBe(false);
});

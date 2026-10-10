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
    },
  });
  expect(parseWebEnv({ VITE_API_BASE_URL: "https://x.example" }).ok).toBe(false);
  expect(
    parseWebEnv({ VITE_API_BASE_URL: "ftp://x", VITE_DATA_BASE_URL: "https://y.example" }).ok,
  ).toBe(false);
});

import { expect, test } from "bun:test";
import { parseEnv } from "../src/env.ts";

const fsEnv = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  WEB_ORIGIN: "https://study-spot.pages.dev",
  DATA_BASE_URL: "https://study-spot-data.pages.dev/",
  PUBLISH_TARGET: "fs",
  FS_PUBLISH_DIR: "/tmp/publish",
};

test("a valid fs environment parses with defaults", () => {
  const r = parseEnv(fsEnv);
  if (!r.ok) throw new Error(r.error);
  expect(r.env.PORT).toBe(3000);
  expect(r.env.CAMPUS_ID).toBe("sbu");
  expect(r.env.DATA_BASE_URL).toBe("https://study-spot-data.pages.dev");
});

test("pages target requires Cloudflare credentials", () => {
  const r = parseEnv({ ...fsEnv, PUBLISH_TARGET: "pages", CF_ACCOUNT_ID: "acc" });
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.error).toContain("CF_API_TOKEN");
    expect(r.error).toContain("CF_DATA_PROJECT");
  }
});

test("a localhost web origin is allowed for development", () => {
  expect(parseEnv({ ...fsEnv, WEB_ORIGIN: "http://localhost:5173" }).ok).toBe(true);
});

test("a web origin with a path or trailing slash is rejected", () => {
  expect(parseEnv({ ...fsEnv, WEB_ORIGIN: "https://study-spot.pages.dev/" }).ok).toBe(false);
  expect(parseEnv({ ...fsEnv, WEB_ORIGIN: "https://x.dev/app" }).ok).toBe(false);
});

test("empty strings count as missing and bad values are rejected", () => {
  expect(parseEnv({ ...fsEnv, DATABASE_URL: "" }).ok).toBe(false);
  expect(parseEnv({ ...fsEnv, DATABASE_URL: "mysql://x" }).ok).toBe(false);
  expect(parseEnv({ ...fsEnv, PORT: "0" }).ok).toBe(false);
  expect(parseEnv({ ...fsEnv, PUBLISH_TARGET: "r2" }).ok).toBe(false);
});

test("RENDER_GIT_COMMIT is optional and passed through", () => {
  const none = parseEnv({ ...fsEnv, RENDER_GIT_COMMIT: "" });
  if (!none.ok) throw new Error(none.error);
  expect(none.env.RENDER_GIT_COMMIT).toBeUndefined();
  const set = parseEnv({ ...fsEnv, RENDER_GIT_COMMIT: "abc1234" });
  if (!set.ok) throw new Error(set.error);
  expect(set.env.RENDER_GIT_COMMIT).toBe("abc1234");
});

import { expect, test } from "bun:test";
import { checkDbHost } from "../src/deploy/dbHost.ts";

const HOST = "ep-cool-dew-123456.us-east-2.aws.neon.tech";
const url = (host: string, query = "?sslmode=require") => `postgres://u:secret@${host}/db${query}`;

test("the expected direct host passes", () => {
  expect(checkDbHost(url(HOST), HOST)).toEqual({ ok: true, host: HOST });
});

test("the pooled host of the same endpoint passes", () => {
  const pooled = "ep-cool-dew-123456-pooler.us-east-2.aws.neon.tech";
  expect(checkDbHost(url(pooled), HOST).ok).toBe(true);
});

test("a different host is rejected without printing the url", () => {
  const result = checkDbHost(url("ep-dev-999.us-east-2.aws.neon.tech"), HOST);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toContain("ep-dev-999");
    expect(result.error).not.toContain("secret");
  }
});

test("a missing or weak sslmode is rejected", () => {
  expect(checkDbHost(url(HOST, ""), HOST).ok).toBe(false);
  expect(checkDbHost(url(HOST, "?sslmode=disable"), HOST).ok).toBe(false);
  expect(checkDbHost(url(HOST, "?sslmode=verify-full"), HOST).ok).toBe(true);
});

test("garbage and non-postgres urls are rejected without echoing them", () => {
  for (const bad of ["", "not a url", "mysql://u:secret@h/db"]) {
    const result = checkDbHost(bad, HOST);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toContain("secret");
  }
});

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

test("a repeated sslmode is rejected, since the driver uses the last one", () => {
  for (const query of [
    "?sslmode=require&sslmode=disable",
    "?sslmode=disable&sslmode=require",
    "?sslmode=require&sslmode=require",
  ]) {
    const result = checkDbHost(url(HOST, query), HOST);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("sslmode");
      expect(result.error).not.toContain("secret");
    }
  }
});

test("query keys that libpq honors over the authority host are rejected", () => {
  for (const query of [
    "?sslmode=require&host=secret.evil.example",
    "?sslmode=require&hostaddr=10.0.0.1",
    "?sslmode=require&service=secret",
    "?sslmode=require&port=6543",
    "?sslmode=require&dbname=postgres://u:secret@evil.example/db",
    "?sslmode=require&options=secret",
  ]) {
    const result = checkDbHost(url(HOST, query), HOST);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toContain("secret");
  }
});

test("only sslmode and channel_binding are allowed, each at most once", () => {
  expect(checkDbHost(url(HOST, "?sslmode=require&channel_binding=require"), HOST).ok).toBe(true);
  const twice = checkDbHost(
    url(HOST, "?sslmode=require&channel_binding=require&channel_binding=disable"),
    HOST,
  );
  expect(twice.ok).toBe(false);
});

test("a database name that is itself a connection string is rejected", () => {
  for (const path of [
    "host%3Dsecret.evil.example",
    "postgres%3A%2F%2Fu%3Asecret%40evil.example%2Fdb",
    "db%ZZ",
  ]) {
    const result = checkDbHost(`postgres://u:secret@${HOST}/${path}?sslmode=require`, HOST);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toContain("secret");
  }
});

test("a multi-host authority is rejected by the host comparison", () => {
  const result = checkDbHost(`postgres://u:secret@${HOST},evil.example/db?sslmode=require`, HOST);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).not.toContain("secret");
});

test("requireDirect rejects the pooled host and keeps the direct one", () => {
  const pooled = "ep-cool-dew-123456-pooler.us-east-2.aws.neon.tech";
  const rejected = checkDbHost(url(pooled), HOST, { requireDirect: true });
  expect(rejected.ok).toBe(false);
  if (!rejected.ok) {
    expect(rejected.error).toContain("pooler");
    expect(rejected.error).not.toContain("secret");
  }
  expect(checkDbHost(url(pooled.toUpperCase()), HOST, { requireDirect: true }).ok).toBe(false);
  expect(checkDbHost(url(HOST), HOST, { requireDirect: true })).toEqual({ ok: true, host: HOST });
});

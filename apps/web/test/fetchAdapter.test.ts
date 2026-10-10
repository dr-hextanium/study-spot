import { expect, test } from "vitest";
import { createFetch } from "../src/adapters/fetch.ts";

test("returns status, text and the Date header, without credentials", async () => {
  const seen: RequestInit[] = [];
  const f = createFetch(async (_url, init) => {
    seen.push(init ?? {});
    return new Response("{}", { status: 200, headers: { date: "Tue, 13 Oct 2026 18:00:00 GMT" } });
  });
  expect(await f.getText("https://data.example/bundle-latest.json")).toEqual({
    status: 200,
    text: "{}",
    date: "Tue, 13 Oct 2026 18:00:00 GMT",
  });
  expect(seen[0]?.credentials).toBe("omit");
  expect(seen[0]?.cache).toBe("no-cache");
});

test("a missing Date is null and a hung request times out", async () => {
  const f = createFetch(async () => new Response("x"));
  expect((await f.getText("https://d/x")).date).toBeNull();
  const hung = createFetch(() => new Promise<Response>(() => {}), 20);
  await expect(hung.getText("https://d/x")).rejects.toThrow(/timed out/);
});

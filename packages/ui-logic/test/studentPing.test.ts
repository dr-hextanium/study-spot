import { expect, test } from "bun:test";
import { createPickPing } from "../src/student/ping.ts";
import { MemoryStorage } from "./fakes.ts";

const API = "https://api.example";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function setup(enabled: boolean, opts: { throws?: boolean; tab?: MemoryStorage } = {}) {
  const sent: { url: string; body: string }[] = [];
  const tab = opts.tab ?? new MemoryStorage();
  const ping = createPickPing(
    {
      enabled,
      tab,
      send: (url, body) => {
        if (opts.throws) throw new Error("offline");
        sent.push({ url, body });
      },
    },
    API,
  );
  return { sent, tab, ping };
}

test("disabled: nothing is sent and nothing is stored", () => {
  const { sent, tab, ping } = setup(false);
  ping(A);
  expect(sent).toEqual([]);
  expect(tab.data.size).toBe(0);
});

test("enabled: first call sends only the spot id, once per spot per tab session", () => {
  const { sent, ping } = setup(true);
  ping(A);
  ping(A);
  ping(B);
  expect(sent).toEqual([
    { url: `${API}/ping/pick`, body: JSON.stringify({ spot_id: A }) },
    { url: `${API}/ping/pick`, body: JSON.stringify({ spot_id: B }) },
  ]);
});

test("the body holds nothing but the spot id", () => {
  const { sent, ping } = setup(true);
  ping(A);
  expect(Object.keys(JSON.parse(sent[0]?.body ?? "{}"))).toEqual(["spot_id"]);
});

test("a throwing send is swallowed", () => {
  const { ping } = setup(true, { throws: true });
  expect(() => ping(A)).not.toThrow();
});

test("a throwing tab storage is swallowed", () => {
  const sent: string[] = [];
  const ping = createPickPing(
    {
      enabled: true,
      send: (_url, body) => void sent.push(body),
      tab: {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
        removeItem: () => {},
      },
    },
    API,
  );
  expect(() => ping(A)).not.toThrow();
});

test("corrupt stored state falls back to empty", () => {
  const tab = new MemoryStorage();
  tab.setItem("student:pinged", '{"not":"a list"}');
  const { sent, ping } = setup(true, { tab });
  ping(A);
  expect(sent).toHaveLength(1);
  expect(JSON.parse(tab.getItem("student:pinged") ?? "null")).toEqual([A]);
});

test("remembers at most 50 ids, dropping the oldest", () => {
  const { tab, ping } = setup(true);
  for (let i = 0; i < 60; i += 1) ping(`id-${i}`);
  const stored: unknown = JSON.parse(tab.getItem("student:pinged") ?? "[]");
  expect(Array.isArray(stored) && stored.length).toBe(50);
  expect(Array.isArray(stored) && stored[0]).toBe("id-10");
});

test("a second tab session (fresh storage) pings again", () => {
  const first = setup(true);
  first.ping(A);
  const second = setup(true);
  second.ping(A);
  expect(first.sent).toHaveLength(1);
  expect(second.sent).toHaveLength(1);
});

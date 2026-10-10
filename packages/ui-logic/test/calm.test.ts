import { expect, test } from "bun:test";
import {
  BUSY_SWAP_MIN_MS,
  type CalmState,
  calmStep,
  createCalmSync,
  SYNCING_MIN_SHOWN_MS,
  SYNCING_SHOW_AFTER_MS,
  type SyncHeader,
} from "../src/index.ts";
import { FakeTimers } from "./fakes.ts";

const synced: SyncHeader = { kind: "all_synced" };
const syncing = (count: number): SyncHeader => ({ kind: "syncing", count });
const pending = (count: number): SyncHeader => ({ kind: "pending", count });

/** Feeds raw headers at given times, checking the honesty rules at every step. */
function play(steps: [number, SyncHeader][], until: number): [number, string][] {
  let state: CalmState | null = null;
  let raw: SyncHeader = synced;
  let due: number | null = null;
  const shown: [number, string][] = [];
  const show = (at: number) => {
    const r = calmStep(state, raw, at);
    state = r.state;
    due = r.recheckIn === null ? null : at + r.recheckIn;
    // Never All synced while writes are waiting; anything not busy shows as it is.
    if (state.shown.kind === "all_synced") expect(raw.kind).toBe("all_synced");
    if (raw.kind !== "syncing" && raw.kind !== "pending" && raw.kind !== "all_synced") {
      expect(state.shown).toEqual(raw);
    }
    const label = state.shown.kind + ("count" in state.shown ? ` ${state.shown.count}` : "");
    if (shown.at(-1)?.[1] !== label) shown.push([at, label]);
  };
  const queue = [...steps];
  for (let at = 0; at <= until; at += 1) {
    const next = queue[0];
    if (next !== undefined && next[0] === at) {
      queue.shift();
      raw = next[1];
      show(at);
    } else if (due !== null && at >= due) show(at);
  }
  return shown;
}

test("a short pass never shows Syncing", () => {
  expect(
    play(
      [
        [0, synced],
        [1000, syncing(1)],
        [1200, synced],
      ],
      4000,
    ),
  ).toEqual([
    [0, "all_synced"],
    [1000, "pending 1"],
    [1000 + SYNCING_MIN_SHOWN_MS, "all_synced"],
  ]);
});

test("a long pass shows Syncing after the delay and keeps it at least the minimum", () => {
  expect(
    play(
      [
        [0, pending(2)],
        [5000, syncing(2)],
        [5500, syncing(1)],
        [5600, synced],
      ],
      9000,
    ),
  ).toEqual([
    [0, "pending 2"],
    [5000 + SYNCING_SHOW_AFTER_MS, "syncing 2"],
    [5500, "syncing 1"],
    [5000 + SYNCING_SHOW_AFTER_MS + SYNCING_MIN_SHOWN_MS, "all_synced"],
  ]);
});

test("waiting and syncing never swap faster than the minimum, whatever the raw state does", () => {
  const steps: [number, SyncHeader][] = [[0, pending(1)]];
  // A pass every 600 ms, each 500 ms long, then a burst of 50 ms ones: the old flicker.
  for (let at = 1000; at < 6000; at += 600) {
    steps.push([at, syncing(1)], [at + 500, pending(1)]);
  }
  for (let at = 6000; at < 7000; at += 100) {
    steps.push([at, syncing(1)], [at + 50, pending(1)]);
  }
  const shown = play(steps, 9000);
  expect(shown.length).toBeGreaterThan(2);
  for (let i = 1; i < shown.length; i += 1) {
    const gap = (shown[i]?.[0] ?? 0) - (shown[i - 1]?.[0] ?? 0);
    expect(gap).toBeGreaterThanOrEqual(BUSY_SWAP_MIN_MS);
  }
  expect(shown.at(-1)?.[1]).toBe("pending 1");
});

test("trouble shows at once, even mid-dwell", () => {
  expect(
    play(
      [
        [0, pending(1)],
        [1000, syncing(1)],
        [1500, { kind: "offline" }],
        [1600, { kind: "failed", count: 1 }],
      ],
      3000,
    ),
  ).toEqual([
    [0, "pending 1"],
    [1000 + SYNCING_SHOW_AFTER_MS, "syncing 1"],
    [1500, "offline"],
    [1600, "failed 1"],
  ]);
});

test("the count follows the queue while the kind is held", () => {
  expect(
    play(
      [
        [0, synced],
        [100, syncing(3)],
        [200, pending(2)],
      ],
      2000,
    ),
  ).toEqual([
    [0, "all_synced"],
    [100, "pending 3"],
    [200, "pending 2"],
  ]);
});

test("createCalmSync follows its source and rechecks on the timers", () => {
  const timers = new FakeTimers();
  let now = 0;
  let raw: SyncHeader = synced;
  const listeners = new Set<() => void>();
  const calm = createCalmSync({
    read: () => raw,
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    timers,
    now: () => now,
  });
  const seen: string[] = [];
  calm.subscribe(() => seen.push(calm.get().kind));
  const set = (next: SyncHeader) => {
    raw = next;
    for (const l of listeners) l();
  };
  const advance = (ms: number) => {
    now += ms;
    timers.advance(ms);
  };
  set(syncing(1));
  expect(calm.get()).toEqual(pending(1));
  advance(SYNCING_SHOW_AFTER_MS);
  expect(calm.get()).toEqual(pending(1));
  advance(BUSY_SWAP_MIN_MS - SYNCING_SHOW_AFTER_MS);
  expect(calm.get()).toEqual(syncing(1));
  set(synced);
  expect(calm.get()).toEqual(syncing(1));
  advance(SYNCING_MIN_SHOWN_MS);
  expect(calm.get()).toEqual(synced);
  expect(seen).toEqual(["pending", "syncing", "all_synced"]);
  expect(timers.scheduled()).toEqual([]);
});

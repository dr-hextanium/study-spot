# Surveyor 2a Client Logic Implementation Plan (Plan B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything the surveyor PWA needs below the screens, in `packages/ui-logic`: a typed client for every plan A route, a stored bearer session, an offline outbox that survives dead zones, killed apps, conflicts, and two tabs, a local view model (spot overview, publish readiness, home lists, sync header), framework-free section forms with the conflict diff, and the typed copy module generated from the copy deck.

**Architecture:** Pure TypeScript over platform adapters. `Http`, `KeyValueCache`, `BinaryCache`, `Clock`, `Ids`, `Timers`, `NetworkStatus`, and `Foreground` are interfaces that `apps/web` implements with browser APIs (plan D). The API client maps every response to an `ApiResult` union after validating it with plan A's schemas in `@study-spot/core`. The outbox stores one record per write, decides order with pure functions (`planEnqueue`, `nextToSend`), and runs one sync pass at a time. View functions apply queued writes on top of server state. Stores expose `subscribe` and `getSnapshot` so plan D's hooks are one-line `useSyncExternalStore` calls.

**Tech Stack:** TypeScript 7 (`tsc -b`), Zod 4.6, Bun 1.3.14 test runner, Biome 2. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-04-surveyor-tooling-design.md` (sections 4, 7, 10). Contract: plan A Task 2 (`docs/superpowers/plans/2026-10-04-surveyor-2a-server.md`), routes in its Tasks 4, 6, 7, 8, 9. Design inputs: `docs/design/surveyor-journey.md`, `docs/design/surveyor-copy.md`. Index: `docs/superpowers/plans/2026-10-04-surveyor-2a-index.md`. Rules: `CLAUDE.md`, `docs/context/stack.md`.

## Global Constraints

- Starts after plan A Task 2 has landed (`packages/core/src/survey/` and `packages/core/test/fixtures/survey-spot.ts`). Never redefine a contract shape here.
- TypeScript flags from `tsconfig.base.json` unchanged: `lib: ["ES2023"]`, `types: []`, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly`.
- No DOM, no React, no React Native, and no `Bun.*` in `packages/ui-logic/src`. No `crypto`, `setTimeout`, `TextEncoder`, `AbortController`, `btoa`, or `structuredClone` in `src`: they do not type-check there (probe below); use the adapters.
- No `any`, no non-null assertions, no TS `enum`, `namespace`, or parameter properties. String literal unions from `as const` arrays.
- Zod at every trust boundary: every response body, every stored record, the stored session.
- Relative imports use explicit `.ts` extensions.
- No em-dashes anywhere (code, comments, docs, copy, commit messages). Use commas or colons.
- Commits: Conventional Commits, subject 72 characters or fewer, imperative, lowercase, no trailing period, no attribution or co-author lines.
- Every commit passes `bun run typecheck && bun run lint && bun test`. Run `bun run fix` before each commit.

## Review Focus

1. **The app is killed mid-sync, then reopened.** A send whose answer was lost must be resent with the same `client_write_id` (the server replays), a record left `syncing` must go back to `pending`, and a crash between saving the id map and deleting a create must still end with one spot. Task 4: "an app killed mid-sync resends the same id and the server applies it once", "a crash after the id map is saved but before the create is removed replays the create".
2. **A 409 on a write whose later sibling is still queued.** The sibling must not be sent on the old version, other spots must keep syncing, and both resolutions must chain the sibling from the server's version. Task 4: "a 409 holds later writes on that spot, other spots go on, and keep mine resends", "keep theirs drops the write, adopts the server spot, and later writes chain from it".
3. **The clock jumps backwards.** Queue order uses a persisted monotonic `seq`, never `created_at`, and backoff uses relative timers only. Task 4: "the clock moving backwards does not reorder queued writes".
4. **A photo record whose bytes were evicted.** It must fail on its own with `photo_missing` and must not hold that spot's text writes. Task 4: "a photo whose bytes were evicted fails alone and does not hold the spot's text".
5. **The same spot edited offline in two tabs.** Both writes must survive (one storage key per record), chain versions, and run once each on the server even when both tabs sync at once. Task 4: "one spot edited offline in two tabs keeps both writes and runs each once".

## Decisions where the spec is silent

Recorded in `docs/context/overview.md` by Task 7.

- **Adapters.** `KeyValueCache` gains `delete` and `keys(prefix)`. New: `BinaryCache` (photo bytes as `Uint8Array`, not base64), `Ids`, `Timers`, `Foreground`, and `Http` (JSON and multipart). `Fetch` stays for the bundle client.
- **Storage layout.** One key per write (`outbox:w:<id>`), plus `outbox:id:<local id>`, `outbox:v:<spot id>`, `outbox:seq`; photo bytes under `photo:<id>`. No shared index key, so two tabs never overwrite each other's writes. Unreadable records are skipped, never deleted.
- **Order.** Oldest `seq` first, where `seq = max(now ms, last seq + 1)`. A draft's create goes before anything else for it (plan A answers a photo for an unknown or `local:` spot with 404), then that spot's photos, then its text writes. Text writes wait behind an earlier failed or conflicted text write on the same spot; photos and other spots continue.
- **Version chaining.** The first queued write for a spot takes the version the surveyor saw. Later ones store `base_version: null` and take the last version the server returned for that spot at send time (verify and review do not bump it, per plan A). Every 2xx answer records its version.
- **Fixing a refused draft.** Saving Basics for a draft whose create is unsent, or was refused with a 4xx such as `slug_taken`, edits the create in place (same id, no server receipt exists), so the draft and everything queued behind it can still sync. Otherwise the only way out would be discarding the draft.
- **Attempts.** `attempts` goes up when a send starts, so `attempts > 0` means the server may hold a receipt. Saving a section again replaces an unsent copy in place, and replaces a sent, failed, or conflicted copy with a new id at the back of the queue.
- **Results.** 2xx: save id map, version, rewrite `local:` ids, then delete (crash-safe order). 409: the write, and any later unsent write of the same section, become `conflict` with the server's spot. 4xx and 410: `failed`. 5xx and network: stay `pending`, back off 30 s doubling to 5 min, reset on success. A 2xx whose body fails the schema is `failed` with `bad_response`, because a resend would replay the same body forever. 401: the write stays `pending` with `attempts` unchanged, `signedOut` is set, and nothing sends until `resume()`.
- **Conflict resolution.** Keep mine: same payload, new id, `base_version` = the server's version. Keep theirs: drop the write and hand the server's spot to `onApplied`. Either way later writes chain from the server's version. Retry of a failed write reuses its id (plan A stores only 2xx answers).
- **Covers.** The upload answer does not say which photo is new, so "Use as cover" queues only for photos with a server id. Plan D hides it on photos still waiting to upload.
- **Online-only calls.** Unpublish, approve, reject, invites, revoke, and publish now go straight through the API client (copy `error.network_admin`), not the outbox. Plan D fetches `GET /survey/photos/:id/image` bytes itself; `Http` returns text only.
- **Hours.** Plan A keeps hours out of `missingV0Fields`, so hours are not under "Needed to publish". The journey lists them as required; the overview shows them first under "Optional now" so the UI stays honest about what blocks publishing. Flagged for plan D.
- **Required parts.** `REQUIRED_PARTS` is the 7 `V0_FIELD` entries mapped to a section; "{count} of 7 required parts" counts them. A server draft whose detail is not cached shows no count.
- **Home lists.** Needs attention: conflict, then failed, then unreviewed by someone else (needs the editor's name), then hours unconfirmed (published spots only, when a term exists). Oldest checks: published spots, never-checked first. Drafts: server drafts plus drafts that only exist on this phone.
- **Honesty.** A queued publish or review shows as queued, never as done, until the server answers.
- **Grid helpers go to plan D.** Copy Monday to weekdays and the busyness tap cycle are a few lines each next to their components; plan B keeps to state that crosses screens.
- **Hooks.** Plan B ships no React and adds no `react` dependency. `react-dom` is banned in `packages/ui-logic/**` by Biome (tests included), so hooks cannot be tested here. Plan D writes `useOutbox` and friends as `useSyncExternalStore(store.subscribe, store.getSnapshot)`; `getSnapshot` returns the same object until something changes (tested).
- **Copy.** `src/copy/copy.gen.ts` is generated from the deck by `bun run copy:gen`; a test keeps module and deck identical. Deck changes: `sync.what.review` and `sync.what.cover` (the outbox queues reviews and covers), and `conflict.body` max chars 80 to 90 (its fixed text is 70 characters, so 80 fit only 10-character names; the test uses a 13-character name).

## Probes run (2026-10-04, in `/private/tmp`, nothing left in the repo)

- **Globals under `lib: ["ES2023"]`, `types: []`, TS 7.0.2:** `crypto`, `TextEncoder`, `structuredClone`, `setTimeout`, `btoa`, and `AbortController` are all `TS2304: Cannot find name`. `Uint8Array` and `encodeURIComponent` are fine. Hence the `Ids`, `Timers`, and `BinaryCache` adapters.
- **Typed copy params:** template-literal extraction of `{name}` placeholders with a rest-tuple `t(id, ...args)` rejects missing, extra, and wrong params under the repo's flags. A mapped type indexed by a generic section (`DRAFT_OF[section](spot)`) type-checks without casts.
- **React 19.3 types** (`useSyncExternalStore`) type-check under the same flags with `skipLibCheck: false`, so plan D can put hooks in `packages/ui-logic` later if it adds `react`.
- **bun:test** has `jest.useFakeTimers`, but `src` cannot call `setTimeout`, so tests use the hand-written `FakeTimers`.
- **Zod 4 `z.uuid()`** enforces the RFC variant nibble (`8`, `9`, `a`, or `b`): fake ids such as `...-4000-c000-...` are rejected, so `sequentialIds` takes a valid prefix.
- **Copy deck:** 332 rows parse with the Task 7 regex, ids unique, no em-dash or `!`, 14 placeholder names. With the sample params only `conflict.body` overflowed (83 of 80), fixed in Task 7.
- **Final-state compile:** plan A Task 2 extracted onto an export of `main`, then the final state of every file in this plan compiled together (not a step-by-step replay): `tsc -b` clean for the whole repo, `biome check` clean, 138 tests pass in `packages/core` and `packages/ui-logic`.

---

## File Structure

```
package.json                                  + copy:gen script
docs/design/surveyor-copy.md                  + sync.what.review, sync.what.cover; conflict.body max 90
docs/context/overview.md                      + decision (plan B)

packages/ui-logic/src/adapters.ts             KeyValueCache delete/keys; BinaryCache, Ids, Timers, Foreground, Http
packages/ui-logic/src/index.ts                + survey, copy re-exports
packages/ui-logic/src/survey/api.ts           ApiResult, interpret, createSurveyApi
packages/ui-logic/src/survey/session.ts       StoredSession, createSessionStore
packages/ui-logic/src/survey/writes.ts        WriteRecord, planEnqueue, nextToSend, rewriteSpotIds
packages/ui-logic/src/survey/outboxStore.ts   createOutboxStore (per-record keys, seq, id map, versions, photo bytes)
packages/ui-logic/src/survey/outbox.ts        createOutbox (sync pass, results, triggers, backoff, resolution)
packages/ui-logic/src/survey/view.ts          buildSpotView, sectionStatuses, publishReadiness, reviewAction, syncHeader, surveyHome
packages/ui-logic/src/survey/forms.ts         draftOf, initForm, setField, submitForm, conflictDiff
packages/ui-logic/src/survey/index.ts         re-exports
packages/ui-logic/src/copy/copy.gen.ts        generated COPY, COPY_MAX
packages/ui-logic/src/copy/index.ts           CopyId, CopyParams, t

packages/ui-logic/test/fakes.ts               + MemoryBinary, MemoryStorage, sequentialIds, FakeTimers, FakeNetwork, FakeForeground, ScriptedHttp, mutableClock
packages/ui-logic/test/builders.ts            record builders shared by Tasks 3 to 6
packages/ui-logic/test/fakeServer.ts          FakeSurveyServer: plan A routes in memory with receipts
packages/ui-logic/test/copyDeck.ts            parseCopyDeck, renderCopyModule
packages/ui-logic/test/gen-copy.ts            writes copy.gen.ts
packages/ui-logic/test/{adapters,api,writes,outbox,view,forms,copy}.test.ts
```

Out of scope: React hooks, screens, browser adapter implementations, photo resize, and the hours grid and busyness grid helpers (copy Monday to weekdays, cycle a bucket), all plan D; headcount routes (phase 2b).

---

### Task 1: Adapters and fakes

**Files:**
- Modify: `packages/ui-logic/src/adapters.ts`, `packages/ui-logic/test/fakes.ts`
- Create: `packages/ui-logic/test/adapters.test.ts`

**Interfaces:**
- Produces: `KeyValueCache.delete(key: string): Promise<void>`, `KeyValueCache.keys(prefix: string): Promise<string[]>`, `interface BinaryCache { get(key): Promise<Uint8Array | null>; set(key, bytes: Uint8Array): Promise<void>; delete(key): Promise<void> }`, `interface Ids { uuid(): string }`, `interface Timers { after(ms: number, fn: () => void): () => void }`, `interface Foreground { subscribe(listener: () => void): () => void }`, `type HttpMethod`, `type HttpFile`, `type HttpBody`, `type HttpRequest`, `interface Http { send(request: HttpRequest): Promise<FetchResponse> }`.
- Produces (tests): `MemoryCache`, `FailingCache` (with the new methods), `MemoryBinary`, `MemoryStorage`, `sequentialIds(prefix?: string): Ids`, `FakeTimers` (`scheduled(): number[]`, `advance(ms)`), `FakeNetwork` (`set(online)`), `FakeForeground` (`fire()`), `ScriptedHttp` (`requests`, `replies`), `mutableClock(iso): Clock & { set(iso): void }`.
- Consumes: `ClientWriteId` (plan A Task 2).

- [ ] **Step 1: Write the failing test**

`packages/ui-logic/test/adapters.test.ts`:

```ts
import { expect, test } from "bun:test";
import { ClientWriteId } from "@study-spot/core";
import { FakeTimers, MemoryCache, sequentialIds } from "./fakes.ts";

test("cache keys filter by prefix and delete removes", async () => {
  const cache = new MemoryCache();
  await cache.set("outbox:w:a", "1");
  await cache.set("outbox:v:a", "2");
  await cache.set("other", "3");
  expect((await cache.keys("outbox:")).sort()).toEqual(["outbox:v:a", "outbox:w:a"]);
  await cache.delete("outbox:w:a");
  expect(await cache.keys("outbox:w:")).toEqual([]);
});

test("fake ids are valid client write ids", () => {
  const ids = sequentialIds();
  expect(ClientWriteId.safeParse(ids.uuid()).success).toBe(true);
  expect(ids.uuid()).not.toBe(ids.uuid());
});

test("fake timers fire in time order and can be cancelled", () => {
  const timers = new FakeTimers();
  const fired: string[] = [];
  timers.after(300, () => fired.push("late"));
  timers.after(100, () => fired.push("early"));
  const cancel = timers.after(200, () => fired.push("cancelled"));
  cancel();
  expect(timers.scheduled()).toEqual([100, 300]);
  timers.advance(250);
  expect(fired).toEqual(["early"]);
  timers.advance(50);
  expect(fired).toEqual(["early", "late"]);
});
```

Run: `bun test packages/ui-logic/test/adapters.test.ts`
Expected: FAIL with an `Export named '...' not found` SyntaxError (the exports this task adds do not exist yet).

- [ ] **Step 2: Extend the adapters**

In `packages/ui-logic/src/adapters.ts`, replace:

```ts
/** Asynchronous larger store (IndexedDB, AsyncStorage). */
export interface KeyValueCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}
```

with:

```ts
/** Asynchronous larger store (IndexedDB, AsyncStorage). */
export interface KeyValueCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Every stored key starting with `prefix`, in any order. */
  keys(prefix: string): Promise<string[]>;
}

/** Asynchronous store for binary records such as photo bytes (IndexedDB). */
export interface BinaryCache {
  get(key: string): Promise<Uint8Array | null>;
  set(key: string, bytes: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Random RFC 4122 version 4 ids (crypto.randomUUID on web). */
export interface Ids {
  uuid(): string;
}

/** Relative timers (setTimeout on web). `after` returns a cancel function. */
export interface Timers {
  after(ms: number, fn: () => void): () => void;
}

/** Fires when the app returns to the foreground (visibilitychange on web, AppState on Expo). */
export interface Foreground {
  subscribe(listener: () => void): () => void;
}
```

Append to the end of the file:

```ts
export type HttpMethod = "GET" | "POST" | "PUT";
export type HttpFile = { field: string; filename: string; contentType: string; bytes: Uint8Array };
export type HttpBody =
  | { kind: "json"; json: string }
  | { kind: "multipart"; fields: Readonly<Record<string, string>>; file: HttpFile };
export type HttpRequest = {
  method: HttpMethod;
  url: string;
  headers: Readonly<Record<string, string>>;
  body: HttpBody | null;
};

/**
 * JSON and multipart requests for the survey API. Rejects on network failure
 * or after the implementation's timeout; non-2xx statuses resolve normally.
 * Implementations set the multipart content type themselves.
 */
export interface Http {
  send(request: HttpRequest): Promise<FetchResponse>;
}
```

- [ ] **Step 3: Extend the fakes**

In `packages/ui-logic/test/fakes.ts`, replace the first line (`import type { Clock, Fetch, FetchResponse, KeyValueCache } from "../src/index.ts";`) with:

```ts
import type {
  BinaryCache,
  Clock,
  Fetch,
  FetchResponse,
  Foreground,
  Http,
  HttpRequest,
  Ids,
  KeyValueCache,
  KeyValueStorage,
  NetworkStatus,
  Timers,
} from "../src/index.ts";
```

In `MemoryCache`, add after its `set` method:

```ts
  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
  async keys(prefix: string): Promise<string[]> {
    return [...this.data.keys()].filter((k) => k.startsWith(prefix));
  }
```

In `FailingCache`, add after its `set` method:

```ts
  async delete(_key: string): Promise<void> {
    if (this.failSet) throw new Error("quota exceeded");
  }
  async keys(_prefix: string): Promise<string[]> {
    if (this.failGet) throw new Error("cache read failed");
    return [];
  }
```

Append to the end of the file:

```ts
/** A clock tests can move, including backwards. */
export function mutableClock(iso: string): Clock & { set(iso: string): void } {
  let now = new Date(iso);
  return {
    now: () => now,
    set: (next) => {
      now = new Date(next);
    },
  };
}

export class MemoryBinary implements BinaryCache {
  readonly data = new Map<string, Uint8Array>();
  async get(key: string): Promise<Uint8Array | null> {
    return this.data.get(key) ?? null;
  }
  async set(key: string, bytes: Uint8Array): Promise<void> {
    this.data.set(key, bytes);
  }
  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}

export class MemoryStorage implements KeyValueStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

/** Valid v4 uuids in sequence; `prefix` keeps two generators apart. */
export function sequentialIds(prefix = "8000"): Ids {
  let n = 0;
  return {
    uuid: () => {
      n += 1;
      return `00000000-0000-4000-${prefix}-${n.toString(16).padStart(12, "0")}`;
    },
  };
}

/** Manual timers: nothing fires until `advance`. */
export class FakeTimers implements Timers {
  private time = 0;
  private seq = 0;
  private readonly pending = new Map<number, { at: number; fn: () => void }>();
  after(ms: number, fn: () => void): () => void {
    this.seq += 1;
    const id = this.seq;
    this.pending.set(id, { at: this.time + ms, fn });
    return () => {
      this.pending.delete(id);
    };
  }
  /** Delays of the scheduled timers from now, soonest first. */
  scheduled(): number[] {
    return [...this.pending.values()].map((p) => p.at - this.time).sort((a, b) => a - b);
  }
  advance(ms: number): void {
    const end = this.time + ms;
    for (;;) {
      let next: { id: number; at: number; fn: () => void } | null = null;
      for (const [id, p] of this.pending) {
        if (p.at <= end && (next === null || p.at < next.at)) next = { id, ...p };
      }
      if (next === null) break;
      this.pending.delete(next.id);
      this.time = next.at;
      next.fn();
    }
    this.time = end;
  }
}

export class FakeNetwork implements NetworkStatus {
  private state = true;
  private readonly listeners = new Set<(online: boolean) => void>();
  online(): boolean {
    return this.state;
  }
  subscribe(listener: (online: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  set(online: boolean): void {
    this.state = online;
    for (const l of this.listeners) l(online);
  }
}

export class FakeForeground implements Foreground {
  private readonly listeners = new Set<() => void>();
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  fire(): void {
    for (const l of this.listeners) l();
  }
}

/** Answers requests from a queue of replies; "offline" or an empty queue rejects. */
export class ScriptedHttp implements Http {
  readonly requests: HttpRequest[] = [];
  readonly replies: (FetchResponse | "offline")[] = [];
  async send(request: HttpRequest): Promise<FetchResponse> {
    this.requests.push(request);
    const reply = this.replies.shift();
    if (reply === undefined || reply === "offline") throw new Error("network down");
    return reply;
  }
}
```

- [ ] **Step 4: Run the package tests**

Run: `bun test packages/ui-logic`
Expected: PASS (the new tests and the existing bundle client and token tests).

- [ ] **Step 5: Commit**

```bash
bun run fix
bun run typecheck && bun run lint && bun test
git add packages/ui-logic
git commit -m "feat(ui-logic): add http, binary cache, ids, timers adapters"
```

---

### Task 2: Survey API client and session store

**Files:**
- Create: `packages/ui-logic/src/survey/api.ts`, `packages/ui-logic/src/survey/session.ts`, `packages/ui-logic/src/survey/index.ts`
- Create: `packages/ui-logic/test/api.test.ts`
- Modify: `packages/ui-logic/src/index.ts`

**Interfaces:**
- Produces: `INVITE_GONE`, `type InviteGoneCode`, `type ApiResult<T> = { kind: "ok"; value: T } | { kind: "conflict"; current: SurveySpot } | { kind: "invalid"; status; code: ApiErrorCode | null; message: string | null; missing: V0Field[] } | { kind: "unauthorized" } | { kind: "gone"; code: InviteGoneCode } | { kind: "network" } | { kind: "server"; status; reason: "status" | "bad_response" }`, `interpret<T>(status: number, text: string, schema: z.ZodType<T>): ApiResult<T>`, `type SurveyApiDeps = { http: Http; baseUrl: string; token: () => string | null }`, `type SectionWriteCall = { client_write_id: string; base_version: number; write: SectionWrite }`, `createSurveyApi(deps)` returning `acceptInvite, me, logout, listSpots, getSpot, createSpot, writeSection(id, SectionWriteCall), verify, publish, unpublish, review, uploadPhoto(fields: PhotoUploadFields, bytes: Uint8Array), setCover, approvePhoto, rejectPhoto, createInvite, listSurveyors, revokeSurveyor, pendingPhotos, publishStatus, publishNow`, each `Promise<ApiResult<T>>` with `T` the plan A response type; `type SurveyApi`.
- Produces: `SESSION_KEY = "survey:session"`, `StoredSession` (`{ token: OpaqueToken, surveyor: SurveyorPublic }`), `type SessionStore = { load(); save(session); clear(); token() }`, `createSessionStore(storage: KeyValueStorage, key?: string): SessionStore`.
- Consumes: plan A Task 2 schemas (`SurveySpot`, `SpotList`, `VersionConflict`, `Incomplete`, `ApiError`, request types, `PHOTO_CONTENT_TYPE`, `OpaqueToken`); `surveySpotFixture`; Task 1 `Http`, `ScriptedHttp`, `MemoryStorage`.

- [ ] **Step 1: Write the failing test**

`packages/ui-logic/test/api.test.ts`:

```ts
import { expect, test } from "bun:test";
import { surveySpotFixture } from "../../core/test/fixtures/survey-spot.ts";
import { createSessionStore, createSurveyApi, SESSION_KEY } from "../src/index.ts";
import { MemoryStorage, ScriptedHttp } from "./fakes.ts";

const BASE = "https://api.example";
const TOKEN = "a".repeat(43);
const WID = "0b7e7f8e-3f3a-4c55-8d5e-1e2f3a4b5c6d";
const spot = surveySpotFixture();
const reply = (status: number, body?: unknown) => ({
  status,
  text: body === undefined ? "" : JSON.stringify(body),
});

function setup(token: string | null = TOKEN) {
  const http = new ScriptedHttp();
  return { http, api: createSurveyApi({ http, baseUrl: BASE, token: () => token }) };
}

test("a section write sends the bearer token, the section path, and only the data", async () => {
  const { http, api } = setup();
  http.replies.push(reply(200, spot));
  const data = { outlet_coverage_pct: 0.4, usb_outlets: null, wifi_mbps: null, cell_signal: null };
  const r = await api.writeSection(spot.id, {
    client_write_id: WID,
    base_version: 3,
    write: { section: "power", data },
  });
  expect(r).toEqual({ kind: "ok", value: spot });
  const sent = http.requests[0];
  expect(sent?.method).toBe("PUT");
  expect(sent?.url).toBe(`${BASE}/survey/spots/${spot.id}/power`);
  expect(sent?.headers.authorization).toBe(`Bearer ${TOKEN}`);
  expect(sent?.body).toEqual({
    kind: "json",
    json: JSON.stringify({ client_write_id: WID, base_version: 3, data }),
  });
});

test("201 is ok and the body is validated", async () => {
  const { http, api } = setup();
  http.replies.push(reply(201, spot), reply(200, { ...spot, version: 0 }));
  expect((await api.getSpot(spot.id)).kind).toBe("ok");
  expect(await api.getSpot(spot.id)).toEqual({
    kind: "server",
    status: 200,
    reason: "bad_response",
  });
});

test("409 carries the current spot", async () => {
  const { http, api } = setup();
  const current = { ...spot, version: 4 };
  http.replies.push(reply(409, { error: "version_conflict", current }));
  expect(await api.review(spot.id, { client_write_id: WID, base_version: 3 })).toEqual({
    kind: "conflict",
    current,
  });
});

test("4xx answers map to invalid with the code, message, and missing list", async () => {
  const cases = [
    [422, { error: "incomplete", missing: ["directions"] }, "incomplete", null, ["directions"]],
    [422, { error: "write_id_reused", message: "used" }, "write_id_reused", "used", []],
    [413, { error: "photo_too_large" }, "photo_too_large", null, []],
    [400, "not an error body", null, null, []],
  ] as const;
  for (const [status, body, code, message, missing] of cases) {
    const { http, api } = setup();
    http.replies.push(reply(status, body));
    expect(await api.publish(spot.id, { client_write_id: WID })).toEqual({
      kind: "invalid",
      status,
      code,
      message,
      missing: [...missing],
    });
  }
});

test("invites: no token is sent and 410 names the reason", async () => {
  const { http, api } = setup(null);
  http.replies.push(reply(410, { error: "invite_used" }), reply(410, {}));
  expect(await api.acceptInvite({ token: TOKEN })).toEqual({ kind: "gone", code: "invite_used" });
  expect(http.requests[0]?.headers.authorization).toBeUndefined();
  expect(await api.acceptInvite({ token: TOKEN })).toEqual({
    kind: "gone",
    code: "invite_invalid",
  });
});

test("no stored token is unauthorized without a request; 401 is unauthorized", async () => {
  const signedOut = setup(null);
  expect(await signedOut.api.listSpots()).toEqual({ kind: "unauthorized" });
  expect(signedOut.http.requests).toEqual([]);
  const { http, api } = setup();
  http.replies.push(reply(401, { error: "unauthorized" }));
  expect(await api.listSpots()).toEqual({ kind: "unauthorized" });
});

test("network failures and 5xx are told apart", async () => {
  const { http, api } = setup();
  http.replies.push("offline", reply(503));
  expect(await api.me()).toEqual({ kind: "network" });
  expect(await api.me()).toEqual({ kind: "server", status: 503, reason: "status" });
});

test("photo upload is multipart with the file and text fields", async () => {
  const { http, api } = setup();
  http.replies.push(reply(201, spot));
  const bytes = new Uint8Array([0xff, 0xd8, 0xff]);
  await api.uploadPhoto({ spot_id: spot.id, client_write_id: WID }, bytes);
  const sent = http.requests[0];
  expect(sent?.headers["content-type"]).toBeUndefined();
  expect(sent?.body).toEqual({
    kind: "multipart",
    fields: { spot_id: spot.id, client_write_id: WID },
    file: { field: "file", filename: "photo.jpg", contentType: "image/jpeg", bytes },
  });
});

test("the session store round-trips and rejects corrupt or old data", () => {
  const storage = new MemoryStorage();
  const sessions = createSessionStore(storage);
  const surveyor = { id: spot.id, display_name: "Ana", role: "surveyor", active: true } as const;
  expect(sessions.load()).toBeNull();
  sessions.save({ token: TOKEN, surveyor });
  expect(sessions.token()).toBe(TOKEN);
  storage.setItem(SESSION_KEY, "{not json");
  expect(sessions.load()).toBeNull();
  storage.setItem(SESSION_KEY, JSON.stringify({ token: "short", surveyor }));
  expect(sessions.token()).toBeNull();
  sessions.save({ token: TOKEN, surveyor });
  sessions.clear();
  expect(storage.getItem(SESSION_KEY)).toBeNull();
});
```

Run: `bun test packages/ui-logic/test/api.test.ts`
Expected: FAIL with an `Export named '...' not found` SyntaxError (the exports this task adds do not exist yet).

- [ ] **Step 2: Write the client**

`packages/ui-logic/src/survey/api.ts`:

```ts
import {
  type AcceptInviteRequest,
  AcceptInviteResponse,
  ApiError,
  type ApiErrorCode,
  type CreateInviteRequest,
  CreateInviteResponse,
  type CreateSpotRequest,
  Incomplete,
  PendingPhotoList,
  PHOTO_CONTENT_TYPE,
  type PhotoUploadFields,
  PublishStatus,
  type ReviewRequest,
  type SectionWrite,
  SpotList,
  SurveyorList,
  SurveyorPublic,
  SurveySpot,
  type V0Field,
  type VerifyRequest,
  VersionConflict,
  type WriteRequest,
} from "@study-spot/core";
import { z } from "zod";
import type { Http, HttpBody, HttpMethod } from "../adapters.ts";

export const INVITE_GONE = ["invite_invalid", "invite_expired", "invite_used"] as const;
export type InviteGoneCode = (typeof INVITE_GONE)[number];

/** Every survey call resolves to one of these; nothing throws. */
export type ApiResult<T> =
  | { kind: "ok"; value: T }
  | { kind: "conflict"; current: SurveySpot }
  | {
      kind: "invalid";
      status: number;
      code: ApiErrorCode | null;
      message: string | null;
      missing: V0Field[];
    }
  | { kind: "unauthorized" }
  | { kind: "gone"; code: InviteGoneCode }
  | { kind: "network" }
  | { kind: "server"; status: number; reason: "status" | "bad_response" };

const InviteGone = z.object({ error: z.enum(INVITE_GONE) });

function parseBody(text: string): unknown {
  if (text === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Maps a status and body to a result, validating the body with `schema` on 2xx. */
export function interpret<T>(status: number, text: string, schema: z.ZodType<T>): ApiResult<T> {
  const body = parseBody(text);
  if (status >= 200 && status < 300) {
    const parsed = schema.safeParse(body);
    return parsed.success
      ? { kind: "ok", value: parsed.data }
      : { kind: "server", status, reason: "bad_response" };
  }
  if (status === 401) return { kind: "unauthorized" };
  if (status === 409) {
    const conflict = VersionConflict.safeParse(body);
    if (conflict.success) return { kind: "conflict", current: conflict.data.current };
  }
  if (status === 410) {
    const gone = InviteGone.safeParse(body);
    return { kind: "gone", code: gone.success ? gone.data.error : "invite_invalid" };
  }
  if (status >= 400 && status < 500) {
    const incomplete = Incomplete.safeParse(body);
    if (incomplete.success) {
      return {
        kind: "invalid",
        status,
        code: "incomplete",
        message: null,
        missing: incomplete.data.missing,
      };
    }
    const err = ApiError.safeParse(body);
    return {
      kind: "invalid",
      status,
      code: err.success ? err.data.error : null,
      message: err.success ? (err.data.message ?? null) : null,
      missing: [],
    };
  }
  return { kind: "server", status, reason: "status" };
}

export type SurveyApiDeps = {
  http: Http;
  /** API origin without a trailing slash, e.g. https://study-spot.onrender.com */
  baseUrl: string;
  /** The stored bearer token, read on every call. */
  token: () => string | null;
};

export type SectionWriteCall = {
  client_write_id: string;
  base_version: number;
  write: SectionWrite;
};

export type SurveyApi = ReturnType<typeof createSurveyApi>;

/** Typed client for every plan A route except the photo image bytes (plan D fetches those). */
export function createSurveyApi(deps: SurveyApiDeps) {
  async function call<T>(
    method: HttpMethod,
    path: string,
    schema: z.ZodType<T>,
    body: HttpBody | null = null,
    auth = true,
  ): Promise<ApiResult<T>> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (body?.kind === "json") headers["content-type"] = "application/json";
    if (auth) {
      const token = deps.token();
      if (token === null) return { kind: "unauthorized" };
      headers.authorization = `Bearer ${token}`;
    }
    let res: { status: number; text: string };
    try {
      res = await deps.http.send({ method, url: `${deps.baseUrl}${path}`, headers, body });
    } catch {
      return { kind: "network" };
    }
    return interpret(res.status, res.text, schema);
  }
  const json = (value: unknown): HttpBody => ({ kind: "json", json: JSON.stringify(value) });
  const spot = (id: string) => `/survey/spots/${encodeURIComponent(id)}`;
  const photo = (id: string) => `/survey/photos/${encodeURIComponent(id)}`;

  return {
    acceptInvite: (req: AcceptInviteRequest) =>
      call("POST", "/auth/accept", AcceptInviteResponse, json(req), false),
    me: () => call("GET", "/auth/me", SurveyorPublic),
    logout: () => call("POST", "/auth/logout", z.null()),
    listSpots: () => call("GET", "/survey/spots", SpotList),
    getSpot: (id: string) => call("GET", spot(id), SurveySpot),
    createSpot: (req: CreateSpotRequest) => call("POST", "/survey/spots", SurveySpot, json(req)),
    writeSection: (id: string, req: SectionWriteCall) =>
      call(
        "PUT",
        `${spot(id)}/${req.write.section}`,
        SurveySpot,
        json({
          client_write_id: req.client_write_id,
          base_version: req.base_version,
          data: req.write.data,
        }),
      ),
    verify: (id: string, req: VerifyRequest) =>
      call("POST", `${spot(id)}/verify`, SurveySpot, json(req)),
    publish: (id: string, req: WriteRequest) =>
      call("POST", `${spot(id)}/publish`, SurveySpot, json(req)),
    unpublish: (id: string, req: WriteRequest) =>
      call("POST", `${spot(id)}/unpublish`, SurveySpot, json(req)),
    review: (id: string, req: ReviewRequest) =>
      call("POST", `${spot(id)}/review`, SurveySpot, json(req)),
    uploadPhoto: (fields: PhotoUploadFields, bytes: Uint8Array) => {
      const parts: Record<string, string> = {
        spot_id: fields.spot_id,
        client_write_id: fields.client_write_id,
      };
      if (fields.taken_at !== undefined) parts.taken_at = fields.taken_at;
      return call("POST", "/survey/photos", SurveySpot, {
        kind: "multipart",
        fields: parts,
        file: { field: "file", filename: "photo.jpg", contentType: PHOTO_CONTENT_TYPE, bytes },
      });
    },
    setCover: (photoId: string, req: WriteRequest) =>
      call("POST", `${photo(photoId)}/cover`, SurveySpot, json(req)),
    approvePhoto: (photoId: string, req: WriteRequest) =>
      call("POST", `${photo(photoId)}/approve`, SurveySpot, json(req)),
    rejectPhoto: (photoId: string, req: WriteRequest) =>
      call("POST", `${photo(photoId)}/reject`, SurveySpot, json(req)),
    createInvite: (req: CreateInviteRequest) =>
      call("POST", "/admin/invites", CreateInviteResponse, json(req)),
    listSurveyors: () => call("GET", "/admin/surveyors", SurveyorList),
    revokeSurveyor: (id: string) =>
      call("POST", `/admin/surveyors/${encodeURIComponent(id)}/revoke`, SurveyorPublic),
    pendingPhotos: () => call("GET", "/admin/photos/pending", PendingPhotoList),
    publishStatus: () => call("GET", "/admin/publish", PublishStatus),
    publishNow: () => call("POST", "/admin/publish", PublishStatus),
  };
}
```

- [ ] **Step 3: Write the session store**

`packages/ui-logic/src/survey/session.ts`:

```ts
import { OpaqueToken, SurveyorPublic } from "@study-spot/core";
import { z } from "zod";
import type { KeyValueStorage } from "../adapters.ts";

export const SESSION_KEY = "survey:session";

export const StoredSession = z.object({ token: OpaqueToken, surveyor: SurveyorPublic });
export type StoredSession = z.infer<typeof StoredSession>;

export type SessionStore = {
  /** The stored session, or null when absent, corrupt, or of an old shape. */
  load(): StoredSession | null;
  save(session: StoredSession): void;
  clear(): void;
  token(): string | null;
};

export function createSessionStore(storage: KeyValueStorage, key = SESSION_KEY): SessionStore {
  const load = (): StoredSession | null => {
    try {
      const raw = storage.getItem(key);
      if (raw === null) return null;
      const parsed = StoredSession.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };
  return {
    load,
    save: (session) => storage.setItem(key, JSON.stringify(StoredSession.parse(session))),
    clear: () => storage.removeItem(key),
    token: () => load()?.token ?? null,
  };
}
```

`packages/ui-logic/src/survey/index.ts`:

```ts
export * from "./api.ts";
export * from "./session.ts";
```

In `packages/ui-logic/src/index.ts`, replace:

```ts
export * from "./contrast.ts";
```

with:

```ts
export * from "./contrast.ts";
export * from "./survey/index.ts";
```

- [ ] **Step 4: Run the tests**

Run: `bun test packages/ui-logic`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run fix
bun run typecheck && bun run lint && bun test
git add packages/ui-logic
git commit -m "feat(ui-logic): add typed survey api client and session store"
```

---

### Task 3: Outbox records, ordering, and storage

**Files:**
- Create: `packages/ui-logic/src/survey/writes.ts`, `packages/ui-logic/src/survey/outboxStore.ts`
- Create: `packages/ui-logic/test/builders.ts`, `packages/ui-logic/test/writes.test.ts`
- Modify: `packages/ui-logic/src/survey/index.ts`

**Interfaces:**
- Produces (`writes.ts`): `LOCAL_PREFIX = "local:"`, `LocalSpotId`, `SpotRef`, `isLocalId(id: string): boolean`, `WRITE_STATE`, `WriteState`, `WriteError`, `WriteRecord` (Zod discriminated union on `kind`: `spot.create | spot.section | spot.verify | spot.review | spot.publish | photo.upload | photo.cover`; fields `client_write_id, spot_id, seq, created_at, attempts, state, error, current, base_version, payload`), `type WriteKind`, `VERSIONED_KINDS`, `type NewWrite`, `bySeq(a, b): number`, `type EnqueuePlan = { put: WriteRecord[]; remove: string[]; seedVersion: number | null }`, `planEnqueue(existing: readonly WriteRecord[], write: NewWrite, serverVersion: number | null, meta: { client_write_id: string; seq: number; created_at: string }): EnqueuePlan` (an identity section for a draft whose create is unsent or refused edits the create), `nextToSend(records: readonly WriteRecord[]): WriteRecord | null`, `rewriteSpotIds(records: readonly WriteRecord[], idMap: Readonly<Record<string, string>>): WriteRecord[]`.
- Produces (`outboxStore.ts`): `photoKey(clientWriteId: string): string`, `createOutboxStore(deps: { cache: KeyValueCache; blobs: BinaryCache; clock: Clock })` with `list, put, remove, nextSeq, idMap, mapId, version, setVersion, putPhoto, photo`; `type OutboxStore`.
- Produces (tests, `builders.ts`): `SPOT_A`, `SPOT_B`, `LOCAL`, `POWER`, `SEATING`, `identity(overrides?)`, `rec(write: NewWrite, extra?)`, `section(spotId, payload, extra?)`, `photo(spotId, extra?)`, `create(spotId, extra?)`.
- Consumes: plan A `IdentitySection`, `SectionWrite`, `SurveySpot`, `BaseVersion`, `ClientWriteId`, `AttributeGroup`, `V0_FIELD`; Task 1 fakes.

- [ ] **Step 1: Write the builders and the failing tests**

`packages/ui-logic/test/builders.ts`:

```ts
import type { IdentitySection, SectionWrite } from "@study-spot/core";
import { type NewWrite, WriteRecord } from "../src/index.ts";
import { sequentialIds } from "./fakes.ts";

export const SPOT_A = "8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a11";
export const SPOT_B = "8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a12";
export const LOCAL = "local:00000000-0000-4000-a000-000000000001";

type Sw<S extends SectionWrite["section"]> = Extract<SectionWrite, { section: S }>;

export const POWER: Sw<"power"> = {
  section: "power",
  data: { outlet_coverage_pct: 0.5, usb_outlets: null, wifi_mbps: null, cell_signal: "good" },
};
export const SEATING: Sw<"seating"> = {
  section: "seating",
  data: {
    seat_count: 40,
    seat_types: [],
    table_configs: [],
    effective_capacity: null,
    max_group_size: 4,
    spread_out_room: null,
  },
};

export function identity(overrides: Partial<IdentitySection> = {}): IdentitySection {
  return {
    slug: "sac-lounge",
    official_name: "SAC Lounge",
    common_name: null,
    building_id: "sac",
    floor: "2",
    lat: 40.9,
    lng: -73.1,
    directions: "Main doors, then left.",
    outdoor: false,
    seasonal: false,
    ...overrides,
  };
}

const ids = sequentialIds("9000");
let seq = 0;

type Extra = Partial<
  Pick<
    WriteRecord,
    "client_write_id" | "seq" | "state" | "attempts" | "base_version" | "error" | "current"
  >
>;

/** A valid record with increasing seq; `extra` overrides the bookkeeping. */
export function rec(write: NewWrite, extra: Extra = {}): WriteRecord {
  seq += 1;
  return WriteRecord.parse({
    client_write_id: ids.uuid(),
    seq,
    created_at: "2026-10-05T15:00:00.000Z",
    attempts: 0,
    state: "pending",
    error: null,
    current: null,
    base_version: null,
    ...write,
    ...extra,
  });
}

export const section = (spot_id: string, payload: SectionWrite, extra: Extra = {}) =>
  rec({ kind: "spot.section", spot_id, payload }, extra);
export const photo = (spot_id: string, extra: Extra = {}) =>
  rec(
    {
      kind: "photo.upload",
      spot_id,
      payload: { taken_at: "2026-10-05T15:00:00.000Z", byte_size: 3 },
    },
    extra,
  );
export const create = (spot_id: string, extra: Extra = {}) =>
  rec({ kind: "spot.create", spot_id, payload: { identity: identity() } }, extra);
```

`packages/ui-logic/test/writes.test.ts`:

```ts
import { expect, test } from "bun:test";
import { surveySpotFixture } from "../../core/test/fixtures/survey-spot.ts";
import {
  createOutboxStore,
  nextToSend,
  photoKey,
  planEnqueue,
  rewriteSpotIds,
  type WriteRecord,
} from "../src/index.ts";
import {
  create,
  identity,
  LOCAL,
  POWER,
  photo,
  rec,
  SEATING,
  SPOT_A,
  SPOT_B,
  section,
} from "./builders.ts";
import { MemoryBinary, MemoryCache, mutableClock } from "./fakes.ts";

const meta = (n: number) => ({
  client_write_id: `00000000-0000-4000-b000-00000000000${n}`,
  seq: 100 + n,
  created_at: "2026-10-05T16:00:00.000Z",
});
const powerWrite = { kind: "spot.section", spot_id: SPOT_A, payload: POWER } as const;

test("the first write for a spot takes the seen version; later ones chain", () => {
  const first = planEnqueue([], powerWrite, 3, meta(1));
  expect(first.put[0]?.base_version).toBe(3);
  expect(first.seedVersion).toBe(3);
  const second = planEnqueue(
    first.put,
    { kind: "spot.section", spot_id: SPOT_A, payload: SEATING },
    3,
    meta(2),
  );
  expect(second.put[0]?.base_version).toBeNull();
  expect(second.seedVersion).toBeNull();
});

test("saving a section again replaces the unsent copy in place", () => {
  const queued = section(SPOT_A, POWER, { base_version: 3 });
  const again = { ...POWER, data: { ...POWER.data, cell_signal: "poor" as const } };
  const plan = planEnqueue([queued], { ...powerWrite, payload: again }, 3, meta(1));
  expect(plan.remove).toEqual([]);
  expect(plan.put).toHaveLength(1);
  expect(plan.put[0]?.client_write_id).toBe(queued.client_write_id);
  expect(plan.put[0]?.payload).toEqual(again);
});

test("saving a failed or conflicted section queues a new id; a conflict rebases", () => {
  const failed = section(SPOT_A, POWER, { state: "failed", attempts: 1, base_version: 3 });
  const plan = planEnqueue([failed], powerWrite, 3, meta(1));
  expect(plan.remove).toEqual([failed.client_write_id]);
  expect(plan.put[0]).toMatchObject({ client_write_id: meta(1).client_write_id, base_version: 3 });

  const current = surveySpotFixture({ version: 7 });
  const conflict = section(SPOT_A, POWER, { state: "conflict", attempts: 1, current });
  expect(planEnqueue([conflict], powerWrite, 3, meta(2)).put[0]?.base_version).toBe(7);
});

test("a second publish is a no-op and invalid section data is refused", () => {
  const publish = rec({ kind: "spot.publish", spot_id: SPOT_A, payload: {} });
  const plan = planEnqueue(
    [publish],
    { kind: "spot.publish", spot_id: SPOT_A, payload: {} },
    3,
    meta(1),
  );
  expect(plan).toEqual({ put: [], remove: [], seedVersion: null });
  const bad = { ...SEATING, data: { ...SEATING.data, seat_count: 0 } };
  expect(() =>
    planEnqueue([], { kind: "spot.section", spot_id: SPOT_A, payload: bad }, 3, meta(2)),
  ).toThrow();
});

test("Basics saved for a refused or unsent create edits the create", () => {
  const refused = create(LOCAL, {
    state: "failed",
    attempts: 1,
    error: { status: 422, code: "slug_taken", message: null, missing: [] },
  });
  const basics = { section: "identity", data: identity({ slug: "sac-lounge-2" }) } as const;
  const plan = planEnqueue(
    [refused],
    { kind: "spot.section", spot_id: LOCAL, payload: basics },
    null,
    meta(1),
  );
  expect(plan.remove).toEqual([]);
  expect(plan.put).toHaveLength(1);
  expect(plan.put[0]).toMatchObject({
    client_write_id: refused.client_write_id,
    payload: { identity: basics.data },
    state: "pending",
    error: null,
  });
});

test("oldest first across spots; photos jump only their own spot's text", () => {
  const b = section(SPOT_B, POWER);
  const a = section(SPOT_A, POWER);
  const aPhoto = photo(SPOT_A);
  expect(nextToSend([aPhoto, a, b])).toBe(b);
  expect(nextToSend([aPhoto, a])).toBe(aPhoto);
});

test("a failed write holds later text on its spot, not photos or other spots", () => {
  const failed = section(SPOT_A, POWER, { state: "failed" });
  const later = section(SPOT_A, SEATING);
  const aPhoto = photo(SPOT_A);
  const other = section(SPOT_B, POWER);
  const records: WriteRecord[] = [failed, later, aPhoto, other];
  expect(nextToSend(records)).toBe(aPhoto);
  expect(nextToSend([failed, later, other])).toBe(other);
  expect(nextToSend([failed, later])).toBeNull();
});

test("rewriting local ids leaves the create alone", () => {
  const records = [create(LOCAL), section(LOCAL, POWER)];
  const changed = rewriteSpotIds(records, { [LOCAL]: SPOT_A });
  expect(changed.map((r) => [r.kind, r.spot_id])).toEqual([["spot.section", SPOT_A]]);
});

test("the store skips unreadable records and removes photo bytes with a record", async () => {
  const cache = new MemoryCache();
  const blobs = new MemoryBinary();
  const store = createOutboxStore({ cache, blobs, clock: mutableClock("2026-10-05T16:00:00Z") });
  const p = photo(SPOT_A);
  await store.put(p);
  await store.putPhoto(p.client_write_id, new Uint8Array([1, 2, 3]));
  await cache.set("outbox:w:broken", "{not json");
  expect(await store.list()).toEqual([p]);
  await store.remove(p.client_write_id);
  expect(blobs.data.has(photoKey(p.client_write_id))).toBe(false);
  expect(await store.list()).toEqual([]);
});
```

Run: `bun test packages/ui-logic/test/writes.test.ts`
Expected: FAIL with an `Export named '...' not found` SyntaxError (the exports this task adds do not exist yet).

- [ ] **Step 2: Write the records and ordering rules**

`packages/ui-logic/src/survey/writes.ts`:

```ts
import {
  AttributeGroup,
  BaseVersion,
  ClientWriteId,
  IdentitySection,
  SectionWrite,
  SurveySpot,
  V0_FIELD,
} from "@study-spot/core";
import { z } from "zod";

/*
 * Outbox write records (spec section 7). Pure: no storage, no network.
 */

export const LOCAL_PREFIX = "local:";
export const LocalSpotId = z.string().regex(/^local:[0-9a-f-]{36}$/);
export const SpotRef = z.union([z.uuid(), LocalSpotId]);

export function isLocalId(id: string): boolean {
  return id.startsWith(LOCAL_PREFIX);
}

export const WRITE_STATE = ["pending", "syncing", "failed", "conflict"] as const;
export const WriteState = z.enum(WRITE_STATE);
export type WriteState = z.infer<typeof WriteState>;

export const WriteError = z.object({
  /** HTTP status, or 0 for a local error. */
  status: z.number().int().nonnegative(),
  /** ApiErrorCode, a local code (photo_missing, bad_response, no_base_version), or null. */
  code: z.string().nullable(),
  message: z.string().nullable(),
  missing: z.array(z.enum(V0_FIELD)),
});
export type WriteError = z.infer<typeof WriteError>;

const Common = {
  client_write_id: ClientWriteId,
  spot_id: SpotRef,
  /** Queue order. Monotonic, so a clock moving backwards never reorders writes. */
  seq: z.number().int().nonnegative(),
  created_at: z.iso.datetime(),
  /** Sends started. Above 0 means the server may hold a receipt for this id. */
  attempts: z.number().int().nonnegative(),
  state: WriteState,
  error: WriteError.nullable(),
  /** The server's spot from a 409, shown in the conflict view. */
  current: SurveySpot.nullable(),
};

/** `base_version` null on a versioned write means "chain from the previous write's response". */
export const WriteRecord = z.discriminatedUnion("kind", [
  z.object({
    ...Common,
    kind: z.literal("spot.create"),
    base_version: z.null(),
    payload: z.object({ identity: IdentitySection }),
  }),
  z.object({
    ...Common,
    kind: z.literal("spot.section"),
    base_version: BaseVersion.nullable(),
    payload: SectionWrite,
  }),
  z.object({
    ...Common,
    kind: z.literal("spot.verify"),
    base_version: BaseVersion.nullable(),
    payload: z.object({ groups: z.array(AttributeGroup).min(1) }),
  }),
  z.object({
    ...Common,
    kind: z.literal("spot.review"),
    base_version: BaseVersion.nullable(),
    payload: z.object({}),
  }),
  z.object({
    ...Common,
    kind: z.literal("spot.publish"),
    base_version: z.null(),
    payload: z.object({}),
  }),
  z.object({
    ...Common,
    kind: z.literal("photo.upload"),
    base_version: z.null(),
    payload: z.object({ taken_at: z.iso.datetime(), byte_size: z.number().int().positive() }),
  }),
  z.object({
    ...Common,
    kind: z.literal("photo.cover"),
    base_version: z.null(),
    payload: z.object({ photo_id: z.uuid() }),
  }),
]);
export type WriteRecord = z.infer<typeof WriteRecord>;
export type WriteKind = WriteRecord["kind"];

/** Writes whose request carries base_version (plan A: section, verify, review). */
export const VERSIONED_KINDS: readonly WriteKind[] = ["spot.section", "spot.verify", "spot.review"];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** What a caller asks to queue; the outbox fills in the bookkeeping. */
export type NewWrite = DistributiveOmit<
  WriteRecord,
  | "client_write_id"
  | "seq"
  | "created_at"
  | "attempts"
  | "state"
  | "error"
  | "current"
  | "base_version"
>;

export function bySeq(a: WriteRecord, b: WriteRecord): number {
  return a.seq - b.seq || (a.client_write_id < b.client_write_id ? -1 : 1);
}

export type EnqueuePlan = {
  put: WriteRecord[];
  remove: string[];
  /** Version to remember for this spot when no earlier write chains it. */
  seedVersion: number | null;
};

/**
 * Decides how a new write joins the queue.
 * - Basics saved for a draft whose create is unsent or was refused edits the create.
 * - The first write for a spot takes the version the surveyor saw; later ones chain (null).
 * - A section saved again replaces its unsent copy in place, or replaces a failed or
 *   conflicted copy with a new id at the back (a conflict rebases onto the server's version).
 * - A second publish or review for a spot is a no-op.
 */
export function planEnqueue(
  existing: readonly WriteRecord[],
  write: NewWrite,
  serverVersion: number | null,
  meta: { client_write_id: string; seq: number; created_at: string },
): EnqueuePlan {
  const sameSpot = existing.filter((r) => r.spot_id === write.spot_id);
  if (write.kind === "spot.publish" || write.kind === "spot.review") {
    if (sameSpot.some((r) => r.kind === write.kind && r.state !== "failed")) {
      return { put: [], remove: [], seedVersion: null };
    }
  }
  // Saving Basics before the create has gone through (or after it was refused,
  // e.g. slug_taken) edits the create itself; no server receipt exists for it.
  const create = sameSpot.find((r) => r.kind === "spot.create");
  if (
    write.kind === "spot.section" &&
    write.payload.section === "identity" &&
    create?.kind === "spot.create" &&
    (create.attempts === 0 || (create.state === "failed" && (create.error?.status ?? 0) >= 400))
  ) {
    const identity = write.payload.data;
    return {
      put: [{ ...create, payload: { identity }, state: "pending", error: null }],
      remove: [],
      seedVersion: null,
    };
  }
  let replaced: WriteRecord | undefined;
  if (write.kind === "spot.section") {
    replaced = sameSpot
      .filter(
        (r) =>
          r.kind === "spot.section" &&
          r.payload.section === write.payload.section &&
          r.state !== "syncing",
      )
      .sort(bySeq)
      .at(-1);
    if (replaced?.kind === "spot.section" && replaced.attempts === 0) {
      return {
        put: [
          { ...replaced, payload: write.payload, state: "pending", error: null, current: null },
        ],
        remove: [],
        seedVersion: null,
      };
    }
  }
  const others = sameSpot.filter((r) => r !== replaced);
  const chained = others.length > 0;
  const versioned = VERSIONED_KINDS.includes(write.kind);
  let base: number | null = versioned && !chained ? serverVersion : null;
  if (versioned && replaced?.state === "conflict" && replaced.current) {
    base = replaced.current.version;
  }
  const record = WriteRecord.parse({
    ...write,
    ...meta,
    base_version: base,
    attempts: 0,
    state: "pending",
    error: null,
    current: null,
  });
  return {
    put: [record],
    remove: replaced ? [replaced.client_write_id] : [],
    seedVersion: chained ? null : serverVersion,
  };
}

function waiting(r: WriteRecord): boolean {
  return r.state === "failed" || r.state === "conflict";
}

function eligible(r: WriteRecord, all: readonly WriteRecord[]): boolean {
  if (waiting(r)) return false;
  if (isLocalId(r.spot_id) && r.kind !== "spot.create") return false;
  if (r.kind === "photo.upload") return true;
  // Text writes wait behind an earlier failed or conflicted text write on the same spot.
  return !all.some(
    (o) => o.spot_id === r.spot_id && o.kind !== "photo.upload" && waiting(o) && bySeq(o, r) < 0,
  );
}

/**
 * The next write to send: oldest first, a spot's create before anything else for it,
 * that spot's photos before its text writes, and nothing behind a failure on the same spot.
 */
export function nextToSend(records: readonly WriteRecord[]): WriteRecord | null {
  const sorted = [...records].sort(bySeq);
  for (const r of sorted) {
    if (!eligible(r, sorted)) continue;
    if (r.kind !== "photo.upload" && r.kind !== "spot.create") {
      const photo = sorted.find(
        (p) => p.kind === "photo.upload" && p.spot_id === r.spot_id && eligible(p, sorted),
      );
      if (photo) return photo;
    }
    return r;
  }
  return null;
}

/** Points writes queued under a local id at the real id. Creates keep their local id. */
export function rewriteSpotIds(
  records: readonly WriteRecord[],
  idMap: Readonly<Record<string, string>>,
): WriteRecord[] {
  const changed: WriteRecord[] = [];
  for (const r of records) {
    const real = idMap[r.spot_id];
    if (r.kind !== "spot.create" && real !== undefined) changed.push({ ...r, spot_id: real });
  }
  return changed;
}
```

- [ ] **Step 3: Write the store**

`packages/ui-logic/src/survey/outboxStore.ts`:

```ts
import { z } from "zod";
import type { BinaryCache, Clock, KeyValueCache } from "../adapters.ts";
import { bySeq, WriteRecord } from "./writes.ts";

/*
 * One key per record, so two tabs adding writes never overwrite each other.
 * Keys: outbox:w:<client_write_id>, outbox:id:<local id> (real id),
 * outbox:v:<spot id> (last known version), outbox:seq. Photo bytes live in the
 * BinaryCache under photo:<client_write_id>.
 */
const WRITE = "outbox:w:";
const ID = "outbox:id:";
const VERSION = "outbox:v:";
const SEQ = "outbox:seq";

export function photoKey(clientWriteId: string): string {
  return `photo:${clientWriteId}`;
}

const Version = z.number().int().positive();
const Seq = z.number().int().nonnegative();
const RealId = z.uuid();

async function readJson<T>(cache: KeyValueCache, key: string, schema: z.ZodType<T>) {
  const raw = await cache.get(key);
  if (raw === null) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type OutboxStore = ReturnType<typeof createOutboxStore>;

export function createOutboxStore(deps: {
  cache: KeyValueCache;
  blobs: BinaryCache;
  clock: Clock;
}) {
  const { cache, blobs } = deps;
  return {
    /** Every readable record in queue order. Unreadable records are skipped, not deleted. */
    async list(): Promise<WriteRecord[]> {
      const keys = await cache.keys(WRITE);
      const records: WriteRecord[] = [];
      for (const key of keys) {
        const r = await readJson(cache, key, WriteRecord);
        if (r) records.push(r);
      }
      return records.sort(bySeq);
    },
    async put(record: WriteRecord): Promise<void> {
      await cache.set(`${WRITE}${record.client_write_id}`, JSON.stringify(record));
    },
    /** Deletes a record and any photo bytes stored for it. */
    async remove(clientWriteId: string): Promise<void> {
      await cache.delete(`${WRITE}${clientWriteId}`);
      await blobs.delete(photoKey(clientWriteId));
    },
    /** Next queue position: the clock in ms, but always after the last one handed out. */
    async nextSeq(): Promise<number> {
      const last = (await readJson(cache, SEQ, Seq)) ?? 0;
      const seq = Math.max(deps.clock.now().getTime(), last + 1);
      await cache.set(SEQ, JSON.stringify(seq));
      return seq;
    },
    async idMap(): Promise<Record<string, string>> {
      const map: Record<string, string> = {};
      for (const key of await cache.keys(ID)) {
        const real = await readJson(cache, key, RealId);
        if (real) map[key.slice(ID.length)] = real;
      }
      return map;
    },
    async mapId(localId: string, realId: string): Promise<void> {
      await cache.set(`${ID}${localId}`, JSON.stringify(realId));
    },
    async version(spotId: string): Promise<number | null> {
      return readJson(cache, `${VERSION}${spotId}`, Version);
    },
    async setVersion(spotId: string, version: number): Promise<void> {
      await cache.set(`${VERSION}${spotId}`, JSON.stringify(version));
    },
    async putPhoto(clientWriteId: string, bytes: Uint8Array): Promise<void> {
      await blobs.set(photoKey(clientWriteId), bytes);
    },
    /** Photo bytes, or null when missing or unreadable (evicted storage). */
    async photo(clientWriteId: string): Promise<Uint8Array | null> {
      try {
        return await blobs.get(photoKey(clientWriteId));
      } catch {
        return null;
      }
    },
  };
}
```

`packages/ui-logic/src/survey/index.ts`:

```ts
export * from "./api.ts";
export * from "./outboxStore.ts";
export * from "./session.ts";
export * from "./writes.ts";
```

- [ ] **Step 4: Run the tests**

Run: `bun test packages/ui-logic`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run fix
bun run typecheck && bun run lint && bun test
git add packages/ui-logic
git commit -m "feat(ui-logic): add outbox records, ordering rules, and store"
```

---

### Task 4: Outbox engine

**Files:**
- Create: `packages/ui-logic/src/survey/outbox.ts`
- Create: `packages/ui-logic/test/fakeServer.ts`, `packages/ui-logic/test/outbox.test.ts`
- Modify: `packages/ui-logic/src/survey/index.ts`

**Interfaces:**
- Produces: `BACKOFF_START_MS = 30_000`, `BACKOFF_MAX_MS = 300_000`, `type OutboxDeps = { cache; blobs; api: SurveyApi; clock; ids; timers; network; foreground }`, `type OutboxSnapshot = { records: readonly WriteRecord[]; idMap: Readonly<Record<string, string>>; syncing: boolean; signedOut: boolean; online: boolean }`, `type SpotWrite` (a `NewWrite` other than create and photo upload), `type ConflictChoice = "mine" | "theirs"`, `createOutbox(deps: OutboxDeps)` returning `start(): Promise<void>`, `stop(): void`, `subscribe(listener): () => void`, `getSnapshot(): OutboxSnapshot`, `onApplied(listener: (spot: SurveySpot, fromLocalId: string | null) => void): () => void`, `createSpot(identity: IdentitySection): Promise<string>` (local id), `enqueue(write: SpotWrite, serverVersion: number | null): Promise<string>`, `addPhoto(spotId: string, serverVersion: number | null, bytes: Uint8Array, takenAt: Date): Promise<string>`, `retry(id): Promise<void>`, `discard(id): Promise<void>`, `resolveConflict(id, choice: ConflictChoice): Promise<void>`, `resume(): void`, `syncNow(): Promise<void>`, `idle(): Promise<void>`; `type Outbox`.
- Produces (tests): `API`, `TOKEN`, `FakeSurveyServer` (`spots`, `requests`, `executed`, `failWith`, `offline`, `signedOut`, `dropNextResponse`, `bump(id, patch?)`, `spot(id)`).
- Consumes: Task 2 `createSurveyApi`, `SurveyApi`, `ApiResult`; Task 3 store and rules; Task 1 adapters and fakes; `surveySpotFixture`.

- [ ] **Step 1: Write the fake server and the failing tests**

The fake answers like plan A: version checks with 409 and the current spot, 422 on an incomplete publish or a duplicate slug, 404 for a photo on an unknown spot, and receipts that replay a stored 2xx answer for a reused `client_write_id`.

`packages/ui-logic/test/fakeServer.ts`:

```ts
import { IdentitySection, SurveySpot } from "@study-spot/core";
import { z } from "zod";
import { surveySpotFixture } from "../../core/test/fixtures/survey-spot.ts";
import type { FetchResponse, Http, HttpRequest } from "../src/index.ts";
import { sequentialIds } from "./fakes.ts";

export const API = "https://api.example";
export const TOKEN = "a".repeat(43);

const Body = z.record(z.string(), z.unknown());
const reply = (status: number, body: unknown): FetchResponse => ({
  status,
  text: JSON.stringify(body),
});

/**
 * Plan A's survey routes in memory: version checks, 409 with the current spot,
 * 422 on an incomplete publish, and receipts that replay a 2xx answer for a
 * reused client_write_id (errors are never stored, like withWrite).
 */
export class FakeSurveyServer implements Http {
  readonly spots = new Map<string, SurveySpot>();
  readonly requests: { method: string; path: string; body: Record<string, unknown> }[] = [];
  /** client_write_ids that ran for real, in order. */
  readonly executed: string[] = [];
  /** Statuses answered, in order, before any handling. */
  readonly failWith: number[] = [];
  offline = false;
  signedOut = false;
  /** Runs the next request, then drops its answer like a connection cut mid-reply. */
  dropNextResponse = false;
  private readonly receipts = new Map<string, FetchResponse>();
  private readonly ids = sequentialIds("b000");

  constructor(spots: SurveySpot[] = []) {
    for (const s of spots) this.spots.set(s.id, s);
  }

  /** Someone else edits a spot. */
  bump(id: string, patch: Partial<SurveySpot> = {}): SurveySpot {
    const s = this.spot(id);
    const next = SurveySpot.parse({ ...s, ...patch, version: s.version + 1 });
    this.spots.set(id, next);
    return next;
  }

  spot(id: string): SurveySpot {
    const s = this.spots.get(id);
    if (!s) throw new Error(`no spot ${id}`);
    return s;
  }

  async send(req: HttpRequest): Promise<FetchResponse> {
    const path = req.url.slice(API.length);
    const body = Body.parse(
      req.body?.kind === "json"
        ? JSON.parse(req.body.json)
        : req.body?.kind === "multipart"
          ? req.body.fields
          : {},
    );
    this.requests.push({ method: req.method, path, body });
    if (this.offline) throw new Error("network down");
    const status = this.failWith.shift();
    if (status !== undefined) return reply(status, { error: "internal" });
    if (this.signedOut) return reply(401, { error: "unauthorized" });
    const writeId = typeof body.client_write_id === "string" ? body.client_write_id : null;
    const prior = writeId === null ? undefined : this.receipts.get(writeId);
    const res = prior ?? this.handle(req.method, path, body);
    if (writeId !== null && !prior && res.status < 300) {
      this.receipts.set(writeId, res);
      this.executed.push(writeId);
    }
    if (this.dropNextResponse) {
      this.dropNextResponse = false;
      throw new Error("connection reset");
    }
    return res;
  }

  private handle(method: string, path: string, body: Record<string, unknown>): FetchResponse {
    if (method === "POST" && path === "/survey/spots") {
      const identity = IdentitySection.parse(body.identity);
      if ([...this.spots.values()].some((x) => x.slug === identity.slug)) {
        return reply(422, { error: "slug_taken", message: "Another spot already uses this." });
      }
      const spot = surveySpotFixture({ ...identity, id: this.ids.uuid(), version: 1, photos: [] });
      this.spots.set(spot.id, spot);
      return reply(201, spot);
    }
    if (method === "POST" && path === "/survey/photos") {
      const s = this.spots.get(String(body.spot_id));
      if (!s) return reply(404, { error: "not_found" });
      const photo = {
        id: this.ids.uuid(),
        spot_id: s.id,
        url: null,
        taken_at: String(body.taken_at),
        is_cover: false,
        uploaded_by: null,
        approved: false,
        approved_at: null,
      };
      return this.save({ ...s, photos: [...s.photos, photo] }, 201);
    }
    const cover = /^\/survey\/photos\/([^/]+)\/cover$/.exec(path);
    if (cover) {
      const s = [...this.spots.values()].find((x) => x.photos.some((p) => p.id === cover[1]));
      if (!s) return reply(404, { error: "not_found" });
      return this.save({
        ...s,
        photos: s.photos.map((p) => ({ ...p, is_cover: p.id === cover[1] })),
      });
    }
    const m = /^\/survey\/spots\/([^/]+)(?:\/([a-z_]+))?$/.exec(path);
    const s = m?.[1] === undefined ? undefined : this.spots.get(m[1]);
    if (!m || !s) return reply(404, { error: "not_found" });
    const action = m[2];
    if (method === "GET") return reply(200, s);
    if (action === "publish") {
      if (s.missing.length > 0) return reply(422, { error: "incomplete", missing: s.missing });
      return this.save({ ...s, status: "published" });
    }
    if (body.base_version !== s.version) {
      return reply(409, { error: "version_conflict", current: s });
    }
    if (action === "verify") return this.save(s);
    if (action === "review") return this.save({ ...s, review_state: "reviewed" });
    const data = Body.parse(body.data);
    const patch = action === "hours" ? { hours: data.rows } : action === "estimates" ? {} : data;
    return this.save({ ...s, ...patch, version: s.version + 1 });
  }

  private save(next: unknown, status = 200): FetchResponse {
    const spot = SurveySpot.parse(next);
    this.spots.set(spot.id, spot);
    return reply(status, spot);
  }
}
```

`packages/ui-logic/test/outbox.test.ts`:

```ts
import { expect, test } from "bun:test";
import type { SurveySpot } from "@study-spot/core";
import { surveySpotFixture } from "../../core/test/fixtures/survey-spot.ts";
import {
  BACKOFF_MAX_MS,
  BACKOFF_START_MS,
  createOutbox,
  createOutboxStore,
  createSurveyApi,
} from "../src/index.ts";
import { identity, POWER, SEATING, SPOT_A, SPOT_B } from "./builders.ts";
import { API, FakeSurveyServer, TOKEN } from "./fakeServer.ts";
import {
  FakeForeground,
  FakeNetwork,
  FakeTimers,
  MemoryBinary,
  MemoryCache,
  mutableClock,
  sequentialIds,
} from "./fakes.ts";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const power = (spot_id: string) => ({ kind: "spot.section", spot_id, payload: POWER }) as const;
const seating = (spot_id: string) => ({ kind: "spot.section", spot_id, payload: SEATING }) as const;

class CrashingCache extends MemoryCache {
  failDeletes = false;
  override async delete(key: string): Promise<void> {
    if (this.failDeletes) throw new Error("killed");
    await super.delete(key);
  }
}

function setup(spots: SurveySpot[] = [surveySpotFixture({ id: SPOT_A, version: 3 })]) {
  const server = new FakeSurveyServer(spots);
  const cache = new CrashingCache();
  const blobs = new MemoryBinary();
  const network = new FakeNetwork();
  const timers = new FakeTimers();
  const foreground = new FakeForeground();
  const clock = mutableClock("2026-10-05T16:00:00Z");
  const api = createSurveyApi({ http: server, baseUrl: API, token: () => TOKEN });
  let tab = 0;
  const make = () => {
    tab += 1;
    const ids = sequentialIds(`80${tab.toString().padStart(2, "0")}`);
    return createOutbox({ cache, blobs, api, clock, ids, timers, network, foreground });
  };
  const sent = () => server.requests.map((r) => `${r.method} ${r.path}`);
  const bases = () => server.requests.map((r) => r.body.base_version);
  return { server, cache, blobs, network, timers, foreground, clock, make, sent, bases };
}

test("a spot created offline syncs its create, then photos, then text, under the real id", async () => {
  const t = setup([]);
  t.network.set(false);
  const box = t.make();
  await box.start();
  const local = await box.createSpot(identity());
  await box.enqueue(power(local), null);
  await box.addPhoto(local, null, JPEG, new Date("2026-10-05T15:59:00Z"));
  const from: (string | null)[] = [];
  box.onApplied((_spot, fromLocal) => from.push(fromLocal));
  t.network.set(true);
  await box.idle();

  const [real] = [...t.server.spots.keys()];
  expect(t.sent()).toEqual([
    "POST /survey/spots",
    "POST /survey/photos",
    `PUT /survey/spots/${real}/power`,
  ]);
  expect(t.bases()).toEqual([undefined, undefined, 1]);
  expect(from).toEqual([local, null, null]);
  expect(box.getSnapshot().records).toEqual([]);
  expect(box.getSnapshot().idMap).toEqual({ [local]: String(real) });
  expect(t.blobs.data.size).toBe(0);
});

test("queued writes on one spot chain base_version from each response", async () => {
  const t = setup();
  t.network.set(false);
  const box = t.make();
  await box.start();
  await box.enqueue(power(SPOT_A), 3);
  await box.enqueue({ kind: "spot.verify", spot_id: SPOT_A, payload: { groups: ["power"] } }, 3);
  await box.enqueue(seating(SPOT_A), 3);
  t.network.set(true);
  await box.idle();
  // Verify does not bump the version (plan A), so the seating write reuses 4.
  expect(t.bases()).toEqual([3, 4, 4]);
  expect(t.server.spot(SPOT_A).version).toBe(5);
});

test("a 409 holds later writes on that spot, other spots go on, and keep mine resends", async () => {
  const t = setup([
    surveySpotFixture({ id: SPOT_A, version: 3 }),
    surveySpotFixture({ id: SPOT_B, slug: "b", version: 1 }),
  ]);
  t.network.set(false);
  const box = t.make();
  await box.start();
  const first = await box.enqueue(power(SPOT_A), 3);
  await box.enqueue(seating(SPOT_A), 3);
  await box.enqueue(power(SPOT_B), 1);
  t.server.bump(SPOT_A, { last_edited_by_name: "Bo" });
  t.network.set(true);
  await box.idle();

  expect(t.sent()).toEqual([
    `PUT /survey/spots/${SPOT_A}/power`,
    `PUT /survey/spots/${SPOT_B}/power`,
  ]);
  const held = box.getSnapshot().records;
  expect(held.map((r) => [r.payload, r.state])).toEqual([
    [POWER, "conflict"],
    [SEATING, "pending"],
  ]);
  expect(held[0]?.current?.version).toBe(4);

  await box.resolveConflict(first, "mine");
  await box.idle();
  expect(t.bases().slice(2)).toEqual([4, 5]);
  expect(box.getSnapshot().records).toEqual([]);
});

test("keep theirs drops the write, adopts the server spot, and later writes chain from it", async () => {
  const t = setup();
  t.network.set(false);
  const box = t.make();
  await box.start();
  const first = await box.enqueue(power(SPOT_A), 3);
  await box.enqueue(seating(SPOT_A), 3);
  const theirs = t.server.bump(SPOT_A);
  t.network.set(true);
  await box.idle();
  const adopted: SurveySpot[] = [];
  box.onApplied((spot) => adopted.push(spot));
  await box.resolveConflict(first, "theirs");
  await box.idle();
  expect(adopted[0]).toEqual(theirs);
  expect(t.sent().at(-1)).toBe(`PUT /survey/spots/${SPOT_A}/seating`);
  expect(t.bases().at(-1)).toBe(4);
});

test("a 422 fails the write with the missing list, and retry sends it again", async () => {
  const t = setup([surveySpotFixture({ id: SPOT_A, version: 3, missing: ["directions"] })]);
  const box = t.make();
  await box.start();
  const id = await box.enqueue({ kind: "spot.publish", spot_id: SPOT_A, payload: {} }, 3);
  await box.idle();
  expect(box.getSnapshot().records[0]).toMatchObject({
    state: "failed",
    error: { status: 422, code: "incomplete", missing: ["directions"] },
  });
  t.server.spots.set(SPOT_A, { ...t.server.spot(SPOT_A), missing: [] });
  await box.retry(id);
  await box.idle();
  expect(box.getSnapshot().records).toEqual([]);
  expect(t.server.spot(SPOT_A).status).toBe("published");
});

test("a 401 pauses sync and keeps the write until resume", async () => {
  const t = setup();
  t.server.signedOut = true;
  const box = t.make();
  await box.start();
  await box.enqueue(power(SPOT_A), 3);
  await box.idle();
  expect(box.getSnapshot().signedOut).toBe(true);
  expect(box.getSnapshot().records[0]).toMatchObject({ state: "pending", attempts: 0 });
  t.foreground.fire();
  await box.idle();
  expect(t.server.requests).toHaveLength(1);
  expect(t.timers.scheduled()).toEqual([]);

  t.server.signedOut = false;
  box.resume();
  await box.idle();
  expect(box.getSnapshot().records).toEqual([]);
});

test("5xx and network failures keep the write and back off from 30 s to 5 min", async () => {
  const t = setup();
  t.server.failWith.push(503, 503, 503, 503);
  const box = t.make();
  await box.start();
  await box.enqueue(power(SPOT_A), 3);
  await box.idle();
  expect(box.getSnapshot().records[0]).toMatchObject({ state: "pending", attempts: 1 });
  const delays: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const [delay = -1] = t.timers.scheduled();
    delays.push(delay);
    if (i === 3) t.server.offline = true;
    t.timers.advance(delay);
    await box.idle();
  }
  expect(delays).toEqual([BACKOFF_START_MS, 60_000, 120_000, 240_000]);
  expect(t.timers.scheduled()).toEqual([BACKOFF_MAX_MS]);
  t.server.offline = false;
  t.timers.advance(BACKOFF_MAX_MS);
  await box.idle();
  expect(box.getSnapshot().records).toEqual([]);
  expect(t.timers.scheduled()).toEqual([]);
});

test("coming online, the foreground, and a new write trigger sync; overlaps collapse", async () => {
  const t = setup();
  t.network.set(false);
  const box = t.make();
  await box.start();
  await box.enqueue(power(SPOT_A), 3);
  expect(t.server.requests).toHaveLength(0);
  t.network.set(true);
  await box.idle();
  expect(t.server.requests).toHaveLength(1);

  t.server.failWith.push(503);
  await box.enqueue(seating(SPOT_A), 4);
  await box.idle();
  t.foreground.fire();
  await box.idle();
  expect(box.getSnapshot().records).toEqual([]);

  let passes = 0;
  let wasSyncing = false;
  box.subscribe(() => {
    const { syncing } = box.getSnapshot();
    if (syncing && !wasSyncing) passes += 1;
    wasSyncing = syncing;
  });
  t.foreground.fire();
  t.foreground.fire();
  t.foreground.fire();
  await box.idle();
  expect(passes).toBe(2);
});

test("an app killed mid-sync resends the same id and the server applies it once", async () => {
  const t = setup();
  const first = t.make();
  await first.start();
  t.server.dropNextResponse = true;
  const id = await first.enqueue(power(SPOT_A), 3);
  await first.idle();
  first.stop();
  // The process died with the record marked as sending.
  const store = createOutboxStore({ cache: t.cache, blobs: t.blobs, clock: t.clock });
  const [left] = await store.list();
  if (!left) throw new Error("record lost");
  await store.put({ ...left, state: "syncing" });

  const reopened = t.make();
  await reopened.start();
  expect(t.server.requests.map((r) => r.body.client_write_id)).toEqual([id, id]);
  expect(t.server.executed).toEqual([id]);
  expect(reopened.getSnapshot().records).toEqual([]);
  expect(await store.version(SPOT_A)).toBe(4);
});

test("a crash after the id map is saved but before the create is removed replays the create", async () => {
  const t = setup([]);
  t.network.set(false);
  const first = t.make();
  await first.start();
  const local = await first.createSpot(identity());
  await first.enqueue(power(local), null);
  t.cache.failDeletes = true;
  t.network.set(true);
  await first.idle();
  first.stop();
  t.cache.failDeletes = false;

  const reopened = t.make();
  await reopened.start();
  const [real] = [...t.server.spots.keys()];
  expect(t.server.spots.size).toBe(1);
  expect(t.sent()).toEqual([
    "POST /survey/spots",
    "POST /survey/spots",
    `PUT /survey/spots/${real}/power`,
  ]);
  expect(t.server.executed).toHaveLength(2);
  expect(reopened.getSnapshot().records).toEqual([]);
});

test("a refused create is fixed by saving Basics again, and its writes follow", async () => {
  const t = setup([surveySpotFixture({ id: SPOT_A, slug: "sac-lounge" })]);
  t.network.set(false);
  const box = t.make();
  await box.start();
  const local = await box.createSpot(identity());
  await box.enqueue(power(local), null);
  t.network.set(true);
  await box.idle();
  expect(box.getSnapshot().records[0]).toMatchObject({
    kind: "spot.create",
    state: "failed",
    error: { status: 422, code: "slug_taken" },
  });
  const basics = { section: "identity", data: identity({ slug: "sac-lounge-2" }) } as const;
  await box.enqueue({ kind: "spot.section", spot_id: local, payload: basics }, null);
  await box.idle();
  const real = box.getSnapshot().idMap[local];
  expect(t.sent()).toEqual([
    "POST /survey/spots",
    "POST /survey/spots",
    `PUT /survey/spots/${real}/power`,
  ]);
  expect(box.getSnapshot().records).toEqual([]);
});

test("a photo whose bytes were evicted fails alone and does not hold the spot's text", async () => {
  const t = setup();
  t.network.set(false);
  const box = t.make();
  await box.start();
  await box.addPhoto(SPOT_A, 3, JPEG, new Date("2026-10-05T15:59:00Z"));
  await box.enqueue(power(SPOT_A), 3);
  t.blobs.data.clear();
  t.network.set(true);
  await box.idle();
  expect(t.sent()).toEqual([`PUT /survey/spots/${SPOT_A}/power`]);
  expect(box.getSnapshot().records).toMatchObject([
    { kind: "photo.upload", state: "failed", error: { status: 0, code: "photo_missing" } },
  ]);
});

test("one spot edited offline in two tabs keeps both writes and runs each once", async () => {
  const t = setup();
  t.network.set(false);
  const tabA = t.make();
  const tabB = t.make();
  await tabA.start();
  await tabB.start();
  await tabA.enqueue(power(SPOT_A), 3);
  await tabB.enqueue(seating(SPOT_A), 3);
  t.network.set(true);
  await Promise.all([tabA.idle(), tabB.idle()]);
  await Promise.all([tabA.syncNow(), tabB.syncNow()]);
  expect(new Set(t.server.executed).size).toBe(2);
  expect(t.server.executed).toHaveLength(2);
  expect(t.server.spot(SPOT_A).version).toBe(5);
  expect(tabB.getSnapshot().records).toEqual([]);
});

test("the clock moving backwards does not reorder queued writes", async () => {
  const t = setup([
    surveySpotFixture({ id: SPOT_A, version: 3 }),
    surveySpotFixture({ id: SPOT_B, slug: "b", version: 1 }),
  ]);
  t.network.set(false);
  const box = t.make();
  await box.start();
  await box.enqueue(power(SPOT_A), 3);
  t.clock.set("2026-10-05T14:00:00Z");
  await box.enqueue(power(SPOT_B), 1);
  t.network.set(true);
  await box.idle();
  expect(t.sent()).toEqual([
    `PUT /survey/spots/${SPOT_A}/power`,
    `PUT /survey/spots/${SPOT_B}/power`,
  ]);
});

test("a 2xx with an unreadable body fails instead of replaying forever", async () => {
  const t = setup();
  t.server.failWith.push(200);
  const box = t.make();
  await box.start();
  await box.enqueue(power(SPOT_A), 3);
  await box.idle();
  expect(box.getSnapshot().records[0]).toMatchObject({
    state: "failed",
    error: { code: "bad_response" },
  });
  expect(t.timers.scheduled()).toEqual([]);
});

test("discarding a draft drops its queued writes and photo bytes", async () => {
  const t = setup([]);
  t.network.set(false);
  const box = t.make();
  await box.start();
  const local = await box.createSpot(identity());
  await box.addPhoto(local, null, JPEG, new Date("2026-10-05T15:59:00Z"));
  const [create] = box.getSnapshot().records;
  if (!create) throw new Error("no create");
  await box.discard(create.client_write_id);
  expect(box.getSnapshot().records).toEqual([]);
  expect(t.blobs.data.size).toBe(0);
});

test("getSnapshot returns the same object until something changes", async () => {
  const t = setup();
  t.network.set(false);
  const box = t.make();
  await box.start();
  const a = box.getSnapshot();
  expect(box.getSnapshot()).toBe(a);
  await box.enqueue(power(SPOT_A), 3);
  expect(box.getSnapshot()).not.toBe(a);
});
```

Run: `bun test packages/ui-logic/test/outbox.test.ts`
Expected: FAIL with an `Export named '...' not found` SyntaxError (the exports this task adds do not exist yet).

- [ ] **Step 2: Write the engine**

`packages/ui-logic/src/survey/outbox.ts`:

```ts
import type { IdentitySection, SurveySpot } from "@study-spot/core";
import type {
  BinaryCache,
  Clock,
  Foreground,
  Ids,
  KeyValueCache,
  NetworkStatus,
  Timers,
} from "../adapters.ts";
import type { ApiResult, SurveyApi } from "./api.ts";
import { createOutboxStore } from "./outboxStore.ts";
import {
  LOCAL_PREFIX,
  type NewWrite,
  nextToSend,
  planEnqueue,
  rewriteSpotIds,
  type WriteError,
  type WriteRecord,
} from "./writes.ts";

export const BACKOFF_START_MS = 30_000;
export const BACKOFF_MAX_MS = 300_000;

export type OutboxDeps = {
  cache: KeyValueCache;
  blobs: BinaryCache;
  api: SurveyApi;
  clock: Clock;
  ids: Ids;
  timers: Timers;
  network: NetworkStatus;
  foreground: Foreground;
};

export type OutboxSnapshot = {
  /** Every queued write, oldest first. */
  records: readonly WriteRecord[];
  /** Local spot id to real id, for redirecting a screen opened on a local id. */
  idMap: Readonly<Record<string, string>>;
  syncing: boolean;
  /** True after a 401 until `resume()`; writes are kept. */
  signedOut: boolean;
  online: boolean;
};

/** Writes a caller may queue for an existing spot (creates and photos have their own calls). */
export type SpotWrite = Exclude<NewWrite, { kind: "spot.create" } | { kind: "photo.upload" }>;
export type ConflictChoice = "mine" | "theirs";
type AppliedListener = (spot: SurveySpot, fromLocalId: string | null) => void;
type SendResult =
  | ApiResult<SurveySpot>
  | { kind: "local"; code: "photo_missing" | "no_base_version" };

export type Outbox = ReturnType<typeof createOutbox>;

/**
 * The offline outbox (spec section 7): writes are saved on the phone first and
 * sent one at a time, oldest first. Survives the app being killed at any point:
 * a resend reuses its client_write_id and the server replays the stored answer.
 */
export function createOutbox(deps: OutboxDeps) {
  const store = createOutboxStore(deps);
  const listeners = new Set<() => void>();
  const applied = new Set<AppliedListener>();
  let snapshot: OutboxSnapshot = {
    records: [],
    idMap: {},
    syncing: false,
    signedOut: false,
    online: deps.network.online(),
  };
  let running: Promise<void> | null = null;
  let rerun = false;
  let backoff = BACKOFF_START_MS;
  let cancelTimer: (() => void) | null = null;
  let unsubscribe: (() => void)[] = [];
  let stopped = true;

  function emit(next: Partial<OutboxSnapshot>): void {
    snapshot = { ...snapshot, ...next };
    for (const l of listeners) l();
  }

  async function refresh(): Promise<WriteRecord[]> {
    const records = await store.list();
    emit({ records, idMap: await store.idMap() });
    return records;
  }

  /** Photo bytes are stored first, so a queued upload always had them once. */
  async function enqueue(
    write: NewWrite,
    serverVersion: number | null,
    bytes: Uint8Array | null = null,
  ): Promise<string> {
    const meta = {
      client_write_id: deps.ids.uuid(),
      seq: await store.nextSeq(),
      created_at: deps.clock.now().toISOString(),
    };
    if (bytes !== null) await store.putPhoto(meta.client_write_id, bytes);
    const plan = planEnqueue(await store.list(), write, serverVersion, meta);
    for (const r of plan.put) await store.put(r);
    for (const id of plan.remove) await store.remove(id);
    if (plan.seedVersion !== null) await store.setVersion(write.spot_id, plan.seedVersion);
    await refresh();
    void sync();
    return plan.put[0]?.client_write_id ?? meta.client_write_id;
  }

  async function send(r: WriteRecord): Promise<SendResult> {
    const { api } = deps;
    const client_write_id = r.client_write_id;
    switch (r.kind) {
      case "spot.create":
        return api.createSpot({ client_write_id, identity: r.payload.identity });
      case "spot.publish":
        return api.publish(r.spot_id, { client_write_id });
      case "photo.cover":
        return api.setCover(r.payload.photo_id, { client_write_id });
      case "photo.upload": {
        const bytes = await store.photo(client_write_id);
        if (bytes === null) return { kind: "local", code: "photo_missing" };
        return api.uploadPhoto(
          { spot_id: r.spot_id, client_write_id, taken_at: r.payload.taken_at },
          bytes,
        );
      }
    }
    // Version chaining: a write queued behind another takes that write's response version.
    const base_version = r.base_version ?? (await store.version(r.spot_id));
    if (base_version === null) return { kind: "local", code: "no_base_version" };
    switch (r.kind) {
      case "spot.section":
        return api.writeSection(r.spot_id, { client_write_id, base_version, write: r.payload });
      case "spot.verify":
        return api.verify(r.spot_id, { client_write_id, base_version, groups: r.payload.groups });
      case "spot.review":
        return api.review(r.spot_id, { client_write_id, base_version });
    }
  }

  /** Order matters for a crash at any step: id map, version, rewrite, then delete. */
  async function applyOk(r: WriteRecord, spot: SurveySpot): Promise<void> {
    const fromLocal = r.kind === "spot.create" ? r.spot_id : null;
    if (fromLocal !== null) await store.mapId(fromLocal, spot.id);
    await store.setVersion(spot.id, spot.version);
    if (fromLocal !== null) {
      for (const moved of rewriteSpotIds(await store.list(), { [fromLocal]: spot.id })) {
        await store.put(moved);
      }
    }
    await store.remove(r.client_write_id);
    backoff = BACKOFF_START_MS;
    for (const l of applied) l(spot, fromLocal);
  }

  async function fail(r: WriteRecord, error: WriteError): Promise<void> {
    await store.put({ ...r, state: "failed", error });
  }

  /** Marks the write, and any later unsent write of the same section, as a conflict. */
  async function conflict(r: WriteRecord, current: SurveySpot): Promise<void> {
    await store.put({ ...r, state: "conflict", current });
    if (r.kind !== "spot.section") return;
    for (const later of await store.list()) {
      if (
        later.seq > r.seq &&
        later.spot_id === r.spot_id &&
        later.kind === "spot.section" &&
        later.payload.section === r.payload.section &&
        later.state === "pending"
      ) {
        await store.put({ ...later, state: "conflict", current });
      }
    }
  }

  /** Sends one write. Returns false when the pass should stop. */
  async function sendOne(r: WriteRecord): Promise<boolean> {
    const sending: WriteRecord = { ...r, state: "syncing", attempts: r.attempts + 1 };
    await store.put(sending);
    await refresh();
    const result = await send(sending);
    switch (result.kind) {
      case "ok":
        await applyOk(sending, result.value);
        return true;
      case "conflict":
        await conflict(sending, result.current);
        return true;
      case "invalid":
        await fail(sending, {
          status: result.status,
          code: result.code,
          message: result.message,
          missing: result.missing,
        });
        return true;
      case "gone":
        await fail(sending, { status: 410, code: result.code, message: null, missing: [] });
        return true;
      case "local":
        await fail(sending, { status: 0, code: result.code, message: null, missing: [] });
        return true;
      case "unauthorized":
        await store.put({ ...sending, state: "pending", attempts: r.attempts });
        emit({ signedOut: true });
        return false;
      case "server":
        if (result.reason === "bad_response") {
          // The server stored this answer, so a plain resend would replay it forever.
          await fail(sending, {
            status: result.status,
            code: "bad_response",
            message: null,
            missing: [],
          });
          return true;
        }
        await store.put({ ...sending, state: "pending" });
        return false;
      case "network":
        await store.put({ ...sending, state: "pending" });
        return false;
    }
  }

  function schedule(delay: number): void {
    cancelTimer?.();
    cancelTimer = deps.timers.after(delay, () => {
      cancelTimer = null;
      void sync();
    });
  }

  async function pass(): Promise<void> {
    if (stopped || snapshot.signedOut || !deps.network.online()) return;
    emit({ syncing: true });
    try {
      for (;;) {
        const next = nextToSend(await store.list());
        if (next === null) {
          cancelTimer?.();
          cancelTimer = null;
          return;
        }
        if (!(await sendOne(next))) {
          if (!snapshot.signedOut) {
            schedule(backoff);
            backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
          }
          return;
        }
      }
    } catch {
      // Storage failed mid-pass; everything is still on disk, so try again later.
      schedule(backoff);
    } finally {
      await refresh().catch(() => undefined);
      emit({ syncing: false });
    }
  }

  /** Runs one pass at a time; triggers during a pass collapse into a single rerun. */
  function sync(): Promise<void> {
    if (running) {
      rerun = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          rerun = false;
          await pass();
        } while (rerun);
      } finally {
        running = null;
      }
    })();
    return running;
  }

  async function update(clientWriteId: string, fn: (r: WriteRecord) => Promise<void>) {
    const r = (await store.list()).find((x) => x.client_write_id === clientWriteId);
    if (r) await fn(r);
    await refresh();
    void sync();
  }

  return {
    /** Loads the queue, resets writes cut off mid-send, and starts listening for triggers. */
    async start(): Promise<void> {
      stopped = false;
      const records = await store.list();
      for (const r of records) {
        if (r.state === "syncing") await store.put({ ...r, state: "pending" });
      }
      for (const moved of rewriteSpotIds(await store.list(), await store.idMap())) {
        await store.put(moved);
      }
      unsubscribe = [
        deps.network.subscribe((online) => {
          emit({ online });
          if (online) void sync();
        }),
        deps.foreground.subscribe(() => void sync()),
      ];
      await refresh();
      await sync();
    },
    stop(): void {
      stopped = true;
      for (const u of unsubscribe) u();
      unsubscribe = [];
      cancelTimer?.();
      cancelTimer = null;
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Same object until something changes, as useSyncExternalStore requires. */
    getSnapshot: (): OutboxSnapshot => snapshot,
    /** Called with each spot the server returns, so the app can update its cached copy. */
    onApplied(listener: AppliedListener): () => void {
      applied.add(listener);
      return () => {
        applied.delete(listener);
      };
    },
    /** Queues a new draft and returns its local id. */
    async createSpot(identity: IdentitySection): Promise<string> {
      const spotId = `${LOCAL_PREFIX}${deps.ids.uuid()}`;
      await enqueue({ kind: "spot.create", spot_id: spotId, payload: { identity } }, null);
      return spotId;
    },
    /** Queues a write. `serverVersion` is the version the surveyor saw; null for a local spot. */
    enqueue: (write: SpotWrite, serverVersion: number | null): Promise<string> =>
      enqueue(write, serverVersion),
    addPhoto: (spotId: string, serverVersion: number | null, bytes: Uint8Array, takenAt: Date) =>
      enqueue(
        {
          kind: "photo.upload",
          spot_id: spotId,
          payload: { taken_at: takenAt.toISOString(), byte_size: bytes.byteLength },
        },
        serverVersion,
        bytes,
      ),
    /** Sends a failed write again with the same id (4xx answers are never stored). */
    retry: (clientWriteId: string) =>
      update(clientWriteId, async (r) => {
        if (r.state === "failed") await store.put({ ...r, state: "pending", error: null });
      }),
    /** Drops a write and its photo bytes; dropping a create drops everything queued for that draft. */
    discard: (clientWriteId: string) =>
      update(clientWriteId, async (r) => {
        const all = await store.list();
        const doomed = r.kind === "spot.create" ? all.filter((x) => x.spot_id === r.spot_id) : [r];
        for (const d of doomed) await store.remove(d.client_write_id);
      }),
    /**
     * Keep mine: send again on top of the server's version, with a new id.
     * Keep theirs: drop the write and adopt the server's spot.
     * Writes queued behind it chain from the server's version either way.
     */
    resolveConflict: (clientWriteId: string, choice: ConflictChoice) =>
      update(clientWriteId, async (r) => {
        if (r.state !== "conflict" || r.current === null) return;
        const current = r.current;
        await store.setVersion(current.id, current.version);
        if (choice === "mine") {
          const again = {
            client_write_id: deps.ids.uuid(),
            attempts: 0,
            state: "pending",
            error: null,
            current: null,
          } as const;
          // Only versioned writes (section, verify, review) can get a 409.
          await store.put(
            r.kind === "spot.section" || r.kind === "spot.verify" || r.kind === "spot.review"
              ? { ...r, ...again, base_version: current.version }
              : { ...r, ...again },
          );
        } else {
          for (const l of applied) l(current, null);
        }
        await store.remove(r.client_write_id);
      }),
    /** After signing in again on this phone. */
    resume(): void {
      emit({ signedOut: false });
      void sync();
    },
    syncNow: (): Promise<void> => sync(),
    /** Resolves when the current pass (if any) ends, without asking for another. */
    idle: (): Promise<void> => running ?? Promise.resolve(),
  };
}
```

In `packages/ui-logic/src/survey/index.ts`, add after the `api.ts` line:

```ts
export * from "./outbox.ts";
```

- [ ] **Step 3: Run the tests**

Run: `bun test packages/ui-logic`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
bun run fix
bun run typecheck && bun run lint && bun test
git add packages/ui-logic
git commit -m "feat(ui-logic): add offline outbox engine with ordered sync"
```

---

### Task 5: Local view model

**Files:**
- Create: `packages/ui-logic/src/survey/view.ts`, `packages/ui-logic/test/view.test.ts`
- Modify: `packages/ui-logic/src/survey/index.ts`

**Interfaces:**
- Produces: `REQUIRED_PARTS: readonly V0Field[]` (7 entries), `type PendingPhoto`, `type SpotView = { spot: SurveySpot; serverVersion: number | null; localOnly: boolean; publishQueued: boolean; reviewQueued: boolean; pendingPhotos: PendingPhoto[]; records: WriteRecord[] }`, `draftSpot(localId, identity, createdAt, term): SurveySpot`, `buildSpotView(server: SurveySpot | null, allRecords: readonly WriteRecord[], spotId: string, term: TermRef | null): SpotView | null`.
- Produces: `type OverviewSection = SurveySection | "photos"`, `type SectionGroup`, `type SectionFill = "missing" | "partial" | "done"`, `type SectionSync = "synced" | "saved_on_phone" | "syncing" | "failed" | "conflict"`, `type SectionStatus`, `OVERVIEW_ORDER`, `sectionStatuses(view: SpotView, opts: { now: Date; tz: string }): SectionStatus[]`, `type PublishReadiness`, `publishReadiness(view): PublishReadiness`, `reviewAction(view, me: SurveyorPublic): "button" | "own" | "none"`, `type SyncHeader`, `syncHeader(snapshot: OutboxSnapshot): SyncHeader`, `type AttentionRow`, `type StaleRow`, `type DraftRow`, `type SurveyHome`, `surveyHome(list: SpotList | null, records: readonly WriteRecord[], me: SurveyorPublic, details: ReadonlyMap<string, SurveySpot>): SurveyHome`.
- Consumes: plan A `missingV0Fields`, `v0InputOf`, `V0_FIELD_SECTION`, `SURVEY_SECTION`, `SpotSummary`; core `campusDate`; Tasks 3 and 4 types; builders.

- [ ] **Step 1: Write the failing tests**

`packages/ui-logic/test/view.test.ts`:

```ts
import { expect, test } from "bun:test";
import type { SpotSummary, SurveyorPublic } from "@study-spot/core";
import { surveySpotFixture } from "../../core/test/fixtures/survey-spot.ts";
import {
  buildSpotView,
  type OutboxSnapshot,
  OVERVIEW_ORDER,
  publishReadiness,
  REQUIRED_PARTS,
  reviewAction,
  type SpotView,
  sectionStatuses,
  surveyHome,
  syncHeader,
} from "../src/index.ts";
import { create, LOCAL, photo, rec, SEATING, SPOT_A, SPOT_B, section } from "./builders.ts";

const TERM = { id: "2026-fall", name: "Fall 2026" };
const ME: SurveyorPublic = {
  id: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bec",
  display_name: "Me",
  role: "surveyor",
  active: true,
};
const OTHER = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
const NY = { now: new Date("2026-10-05T16:00:00Z"), tz: "America/New_York" };

function view(records = [section(SPOT_A, SEATING)], over = {}): SpotView {
  const server = surveySpotFixture({
    id: SPOT_A,
    seat_count: null,
    missing: ["seat_count"],
    ...over,
  });
  const v = buildSpotView(server, records, SPOT_A, TERM);
  if (!v) throw new Error("no view");
  return v;
}

test("queued writes show on top of the server copy and missing is recomputed", () => {
  const v = view();
  expect(v.spot.seat_count).toBe(40);
  expect(v.spot.missing).toEqual([]);
  expect(v.spot.verified.seating).toBe("2026-10-05T15:00:00.000Z");
  const seating = sectionStatuses(v, NY).find((s) => s.section === "seating");
  expect(seating).toMatchObject({ fill: "done", sync: "saved_on_phone", group: "required" });
  expect(publishReadiness(v)).toEqual({ kind: "ready" });
});

test("missingV0Fields parity: with nothing queued the phone agrees with the server", () => {
  for (const s of [
    surveySpotFixture(),
    surveySpotFixture({ directions: null, verified: {}, missing: ["directions", "last_verified"] }),
  ]) {
    expect(buildSpotView(s, [], s.id, TERM)?.spot.missing).toEqual(s.missing);
  }
});

test("a draft made on this phone builds from its create", () => {
  const v = buildSpotView(null, [create(LOCAL)], LOCAL, TERM);
  expect(v?.localOnly).toBe(true);
  expect(v?.serverVersion).toBeNull();
  expect(v?.spot.missing).toEqual([
    "eligibility",
    "seat_count",
    "outlet_coverage_pct",
    "noise_policy",
    "group_work_ok",
    "food_policy",
  ]);
  expect(buildSpotView(null, [], LOCAL, TERM)).toBeNull();
});

test("7 required parts, matching the copy deck", () => {
  expect(REQUIRED_PARTS).toHaveLength(7);
});

test("overview order: needed to publish, photos and busyness, then optional", () => {
  expect(OVERVIEW_ORDER).toEqual([
    "identity",
    "access",
    "seating",
    "power",
    "environment",
    "use_fit",
    "photos",
    "estimates",
    "hours",
    "amenities",
    "accessibility",
    "late_night",
  ]);
});

test("checked today uses the campus date, not UTC", () => {
  const lateEvening = "2026-10-06T03:30:00.000Z";
  const v = view([], { verified: { power: lateEvening } });
  const power = (tz: string) =>
    sectionStatuses(v, { now: NY.now, tz }).find((s) => s.section === "power");
  expect(power("America/New_York")).toMatchObject({ verifiedAt: lateEvening, checkedToday: true });
  expect(power("UTC")?.checkedToday).toBe(false);
});

test("fill states: partial use fit, partial estimates, photos waiting to upload", () => {
  const v = view([photo(SPOT_A)], {
    group_work_ok: null,
    missing: ["group_work_ok"],
    photos: [],
  });
  const fills = Object.fromEntries(sectionStatuses(v, NY).map((s) => [s.section, s.fill]));
  expect(fills).toMatchObject({
    use_fit: "partial",
    seating: "missing",
    estimates: "partial",
    photos: "done",
    hours: "done",
    late_night: "done",
    accessibility: "done",
  });
  expect(v.pendingPhotos).toHaveLength(1);
});

test("publish readiness lists missing fields with their sections", () => {
  expect(publishReadiness(view([]))).toEqual({
    kind: "blocked",
    missing: [{ field: "seat_count", section: "seating" }],
  });
  const queued = view([rec({ kind: "spot.publish", spot_id: SPOT_A, payload: {} })]);
  expect(publishReadiness(queued)).toEqual({ kind: "queued" });
  expect(publishReadiness(view([], { status: "published" }))).toEqual({ kind: "published" });
});

test("review: admins always, never your own edit, nothing once reviewed", () => {
  const byOther = view([], { last_edited_by: OTHER });
  expect(reviewAction(byOther, ME)).toBe("button");
  expect(reviewAction(view([], { last_edited_by: ME.id }), ME)).toBe("own");
  expect(reviewAction(view([section(SPOT_A, SEATING)], { last_edited_by: OTHER }), ME)).toBe("own");
  expect(reviewAction(view([], { last_edited_by: ME.id }), { ...ME, role: "admin" })).toBe(
    "button",
  );
  expect(reviewAction(view([], { review_state: "reviewed" }), ME)).toBe("none");
});

test("the sync header puts stuck writes first, then offline, then progress", () => {
  const base: OutboxSnapshot = {
    records: [],
    idMap: {},
    syncing: false,
    signedOut: false,
    online: true,
  };
  const pending = section(SPOT_A, SEATING);
  const failed = section(SPOT_B, SEATING, { state: "failed" });
  expect(syncHeader(base)).toEqual({ kind: "all_synced" });
  expect(syncHeader({ ...base, records: [pending] })).toEqual({ kind: "pending", count: 1 });
  expect(syncHeader({ ...base, records: [pending], syncing: true })).toEqual({
    kind: "syncing",
    count: 1,
  });
  expect(syncHeader({ ...base, records: [pending], online: false })).toEqual({ kind: "offline" });
  expect(syncHeader({ ...base, records: [pending, failed], online: false })).toEqual({
    kind: "failed",
    count: 1,
  });
  expect(syncHeader({ ...base, signedOut: true })).toEqual({ kind: "signed_out" });
});

function summary(over: Partial<SpotSummary>): SpotSummary {
  return {
    id: SPOT_A,
    slug: "a",
    official_name: "A",
    common_name: null,
    building_id: "sac",
    building_name: "Student Activities Center",
    status: "published",
    review_state: "reviewed",
    version: 3,
    last_edited_by: ME.id,
    last_edited_by_name: "Me",
    updated_at: "2026-10-05T15:00:00.000Z",
    oldest_verified_at: "2026-10-01T15:00:00.000Z",
    hours_confirmed: true,
    ...over,
  };
}

test("home: attention by urgency, oldest checks first, drafts with part counts", () => {
  const ids = (n: number) => `8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a2${n}`;
  const list = {
    term: TERM,
    spots: [
      summary({ id: ids(1), official_name: "Hours gap", hours_confirmed: false }),
      summary({
        id: ids(2),
        official_name: "Bo's edit",
        review_state: "unreviewed",
        last_edited_by: OTHER,
        last_edited_by_name: "Bo",
      }),
      summary({ id: ids(3), official_name: "Broken" }),
      summary({ id: ids(4), official_name: "Never", oldest_verified_at: null }),
      summary({ id: ids(5), official_name: "Draft", status: "draft" }),
    ],
  };
  const records = [section(ids(3), SEATING, { state: "failed" }), create(LOCAL)];
  const details = new Map([[ids(5), surveySpotFixture({ id: ids(5), seat_count: null })]]);
  const home = surveyHome(list, records, ME, details);
  expect(home.attention.map((r) => [r.name, r.reason])).toEqual([
    ["Broken", "failed"],
    ["Bo's edit", "unreviewed"],
    ["Hours gap", "hours_unconfirmed"],
  ]);
  expect(home.stale.map((r) => r.name)).toEqual(["Never", "Bo's edit", "Broken", "Hours gap"]);
  expect(home.drafts).toEqual([
    { spotId: ids(5), name: "Draft", localOnly: false, requiredDone: 6 },
    { spotId: LOCAL, name: "SAC Lounge", localOnly: true, requiredDone: 1 },
  ]);
});
```

Run: `bun test packages/ui-logic/test/view.test.ts`
Expected: FAIL with an `Export named '...' not found` SyntaxError (the exports this task adds do not exist yet).

- [ ] **Step 2: Write the view model**

`packages/ui-logic/src/survey/view.ts`:

```ts
import {
  ATTRIBUTE_GROUP,
  type AttributeGroup,
  campusDate,
  type IdentitySection,
  missingV0Fields,
  type SpotList,
  SURVEY_SECTION,
  type SurveyorPublic,
  type SurveySection,
  type SurveySpot,
  type TermRef,
  V0_FIELD,
  V0_FIELD_SECTION,
  type V0Field,
  v0InputOf,
} from "@study-spot/core";
import type { OutboxSnapshot } from "./outbox.ts";
import { isLocalId, type WriteRecord, type WriteState } from "./writes.ts";

/** Fields that count toward "{count} of 7 required parts": every v0 field filled by a section. */
export const REQUIRED_PARTS: readonly V0Field[] = V0_FIELD.filter(
  (f) => V0_FIELD_SECTION[f] !== null,
);

export type PendingPhoto = { client_write_id: string; taken_at: string; state: WriteState };

/**
 * A spot as this phone sees it: the server's copy with queued writes applied.
 * `spot` is never parsed with SurveySpot: a local draft has a local id and version 0.
 */
export type SpotView = {
  spot: SurveySpot;
  /** Version of the server copy; null for a draft that only exists on this phone. */
  serverVersion: number | null;
  localOnly: boolean;
  publishQueued: boolean;
  reviewQueued: boolean;
  pendingPhotos: PendingPhoto[];
  /** This spot's queued writes, oldest first. */
  records: WriteRecord[];
};

function isGroup(section: string): section is AttributeGroup {
  return (ATTRIBUTE_GROUP as readonly string[]).includes(section);
}

/** The server shape for a draft created on this phone. */
export function draftSpot(
  localId: string,
  identity: IdentitySection,
  createdAt: string,
  term: TermRef | null,
): SurveySpot {
  return {
    ...identity,
    id: localId,
    status: "draft",
    review_state: "unreviewed",
    version: 0,
    last_edited_by: null,
    last_edited_by_name: null,
    reviewed_by: null,
    reviewed_by_name: null,
    updated_at: createdAt,
    eligibility: null,
    eligibility_scope: null,
    eligibility_verified: false,
    entry_method: null,
    reservable: false,
    reservation_system: null,
    reservation_url: null,
    seat_count: null,
    seat_types: [],
    table_configs: [],
    effective_capacity: null,
    max_group_size: null,
    spread_out_room: null,
    outlet_coverage_pct: null,
    usb_outlets: null,
    wifi_mbps: null,
    cell_signal: null,
    noise_policy: null,
    natural_light: null,
    lighting: null,
    temperature: null,
    temperature_consistent: null,
    windows_view: null,
    calls_ok: null,
    group_work_ok: null,
    whiteboard: null,
    food_policy: null,
    amenities: [],
    step_free: null,
    elevator: null,
    accessible_seating: null,
    open_past_midnight: null,
    staffed_late: null,
    lit_route_to_residences: null,
    term,
    hours: [],
    estimates: [],
    verified: { identity: createdAt },
    photos: [],
    missing: [],
  };
}

function applyWrite(spot: SurveySpot, r: WriteRecord): SurveySpot {
  const stamp = (groups: readonly AttributeGroup[]) => {
    const verified = { ...spot.verified };
    for (const g of groups) verified[g] = r.created_at;
    return verified;
  };
  switch (r.kind) {
    case "spot.section": {
      const w = r.payload;
      switch (w.section) {
        case "hours":
          if (spot.term?.id !== w.data.term_id) return spot;
          return { ...spot, hours: w.data.rows, verified: stamp(["hours"]) };
        case "estimates": {
          const kept = spot.estimates.filter(
            (e) => !w.data.cells.some((c) => c.day_type === e.day_type && c.block === e.block),
          );
          const added = w.data.cells.map((c) => ({ ...c, created_at: r.created_at }));
          return { ...spot, estimates: [...kept, ...added] };
        }
        default:
          return { ...spot, ...w.data, verified: stamp([w.section]) };
      }
    }
    case "spot.verify":
      return { ...spot, verified: stamp(r.payload.groups) };
    case "photo.cover":
      return {
        ...spot,
        photos: spot.photos.map((p) => ({ ...p, is_cover: p.id === r.payload.photo_id })),
      };
    default:
      return spot;
  }
}

/**
 * Applies this spot's queued writes (all states: they are still on this phone)
 * to the server copy, or to a draft built from the queued create.
 */
export function buildSpotView(
  server: SurveySpot | null,
  allRecords: readonly WriteRecord[],
  spotId: string,
  term: TermRef | null,
): SpotView | null {
  const records = allRecords.filter((r) => r.spot_id === spotId);
  const create = records.find((r) => r.kind === "spot.create");
  let spot =
    server ??
    (create?.kind === "spot.create"
      ? draftSpot(spotId, create.payload.identity, create.created_at, term)
      : null);
  if (spot === null) return null;
  for (const r of records) spot = applyWrite(spot, r);
  spot = { ...spot, missing: missingV0Fields(v0InputOf(spot)) };
  return {
    spot,
    serverVersion: server?.version ?? null,
    localOnly: server === null,
    publishQueued: records.some((r) => r.kind === "spot.publish" && r.state !== "failed"),
    reviewQueued: records.some((r) => r.kind === "spot.review" && r.state !== "failed"),
    pendingPhotos: records.flatMap((r) =>
      r.kind === "photo.upload"
        ? [{ client_write_id: r.client_write_id, taken_at: r.payload.taken_at, state: r.state }]
        : [],
    ),
    records,
  };
}

export type OverviewSection = SurveySection | "photos";
export type SectionGroup = "required" | "extras" | "optional";
export type SectionFill = "missing" | "partial" | "done";
export type SectionSync = "synced" | "saved_on_phone" | "syncing" | "failed" | "conflict";

export type SectionStatus = {
  section: OverviewSection;
  group: SectionGroup;
  fill: SectionFill;
  /** Last check of this attribute group; null for estimates and photos. */
  verifiedAt: string | null;
  checkedToday: boolean;
  sync: SectionSync;
};

const REQUIRED_SECTIONS: readonly SurveySection[] = SURVEY_SECTION.filter((s) =>
  REQUIRED_PARTS.some((f) => V0_FIELD_SECTION[f] === s),
);

/** Overview order: needed to publish, then photos and busyness, then optional (hours first). */
export const OVERVIEW_ORDER: readonly OverviewSection[] = [
  ...REQUIRED_SECTIONS,
  "photos",
  "estimates",
  ...SURVEY_SECTION.filter((s) => s !== "estimates" && !REQUIRED_SECTIONS.includes(s)),
];

function groupOf(section: OverviewSection): SectionGroup {
  if (section === "photos" || section === "estimates") return "extras";
  return REQUIRED_SECTIONS.includes(section) ? "required" : "optional";
}

function touches(r: WriteRecord, section: OverviewSection): boolean {
  switch (r.kind) {
    case "spot.create":
      return section === "identity";
    case "spot.section":
      return r.payload.section === section;
    case "spot.verify":
      return r.payload.groups.some((g) => g === section);
    case "photo.upload":
    case "photo.cover":
      return section === "photos";
    default:
      return false;
  }
}

const SYNC_RANK: Record<WriteState, SectionSync> = {
  conflict: "conflict",
  failed: "failed",
  syncing: "syncing",
  pending: "saved_on_phone",
};
const SYNC_ORDER: readonly SectionSync[] = ["conflict", "failed", "syncing", "saved_on_phone"];

function syncOf(records: readonly WriteRecord[], section: OverviewSection): SectionSync {
  const states = records.filter((r) => touches(r, section)).map((r) => SYNC_RANK[r.state]);
  return SYNC_ORDER.find((s) => states.includes(s)) ?? "synced";
}

const OPTIONAL_FIELDS = {
  amenities: ["amenities"],
  accessibility: ["step_free", "elevator", "accessible_seating"],
  late_night: ["open_past_midnight", "staffed_late", "lit_route_to_residences"],
} as const satisfies Partial<Record<SurveySection, readonly (keyof SurveySpot)[]>>;

function filled(value: unknown): boolean {
  return value !== null && !(Array.isArray(value) && value.length === 0);
}

function fillOf(view: SpotView, section: OverviewSection): SectionFill {
  const { spot } = view;
  switch (section) {
    case "photos":
      return spot.photos.length + view.pendingPhotos.length > 0 ? "done" : "missing";
    case "estimates":
      return spot.estimates.length === 0
        ? "missing"
        : spot.estimates.length < 8
          ? "partial"
          : "done";
    case "hours":
      return spot.hours.length > 0 ? "done" : "missing";
    case "amenities":
    case "accessibility":
    case "late_night":
      return OPTIONAL_FIELDS[section].some((f) => filled(spot[f])) ? "done" : "missing";
    default: {
      const required = REQUIRED_PARTS.filter((f) => V0_FIELD_SECTION[f] === section);
      const gaps = required.filter((f) => spot.missing.includes(f)).length;
      return gaps === 0 ? "done" : gaps < required.length ? "partial" : "missing";
    }
  }
}

/** Every overview row, in display order, with fill, check date, and sync state. */
export function sectionStatuses(view: SpotView, opts: { now: Date; tz: string }): SectionStatus[] {
  const today = campusDate(opts.now, opts.tz);
  return OVERVIEW_ORDER.map((section) => {
    const verifiedAt = isGroup(section) ? (view.spot.verified[section] ?? null) : null;
    return {
      section,
      group: groupOf(section),
      fill: fillOf(view, section),
      verifiedAt,
      checkedToday: verifiedAt !== null && campusDate(new Date(verifiedAt), opts.tz) === today,
      sync: syncOf(view.records, section),
    };
  });
}

export type PublishReadiness =
  | { kind: "published" }
  | { kind: "queued" }
  | { kind: "ready" }
  | { kind: "blocked"; missing: { field: V0Field; section: AttributeGroup | null }[] };

/** Same rule as the server (missingV0Fields), applied to this phone's view. */
export function publishReadiness(view: SpotView): PublishReadiness {
  if (view.spot.status === "published") return { kind: "published" };
  if (view.publishQueued) return { kind: "queued" };
  if (view.spot.missing.length === 0) return { kind: "ready" };
  return {
    kind: "blocked",
    missing: view.spot.missing.map((field) => ({ field, section: V0_FIELD_SECTION[field] })),
  };
}

/** "button": show Looks right. "own": show spot.review.own. "none": show nothing. */
export function reviewAction(view: SpotView, me: SurveyorPublic): "button" | "own" | "none" {
  if (view.spot.review_state === "reviewed" || view.reviewQueued) return "none";
  if (me.role === "admin") return "button";
  const editedHere = view.localOnly || view.records.some((r) => r.kind === "spot.section");
  return editedHere || view.spot.last_edited_by === me.id ? "own" : "button";
}

export type SyncHeader =
  | { kind: "signed_out" }
  | { kind: "failed"; count: number }
  | { kind: "offline" }
  | { kind: "syncing"; count: number }
  | { kind: "pending"; count: number }
  | { kind: "all_synced" };

/** The header line: what needs the surveyor first, then connectivity, then progress. */
export function syncHeader(s: OutboxSnapshot): SyncHeader {
  if (s.signedOut) return { kind: "signed_out" };
  const stuck = s.records.filter((r) => r.state === "failed" || r.state === "conflict").length;
  if (stuck > 0) return { kind: "failed", count: stuck };
  if (!s.online) return { kind: "offline" };
  const waiting = s.records.length;
  if (waiting === 0) return { kind: "all_synced" };
  return s.syncing ? { kind: "syncing", count: waiting } : { kind: "pending", count: waiting };
}

type Row = { spotId: string; name: string };
export type AttentionRow = Row &
  (
    | { reason: "conflict" }
    | { reason: "failed"; count: number }
    | { reason: "unreviewed"; editor: string }
    | { reason: "hours_unconfirmed"; term: string }
  );
export type StaleRow = Row & { oldestVerifiedAt: string | null };
export type DraftRow = Row & { localOnly: boolean; requiredDone: number | null };
export type SurveyHome = { attention: AttentionRow[]; stale: StaleRow[]; drafts: DraftRow[] };

const REASON_ORDER = ["conflict", "failed", "unreviewed", "hours_unconfirmed"] as const;
const byName = (a: Row, b: Row) => a.name.localeCompare(b.name);

/**
 * Home lists. `details` holds cached full spots (for the drafts' required-part
 * counts); a draft without a cached detail shows no count.
 */
export function surveyHome(
  list: SpotList | null,
  records: readonly WriteRecord[],
  me: SurveyorPublic,
  details: ReadonlyMap<string, SurveySpot>,
): SurveyHome {
  const term = list?.term ?? null;
  const nameOf = (spotId: string, fallback: string): string => {
    let name = fallback;
    for (const r of records) {
      if (r.spot_id !== spotId) continue;
      if (r.kind === "spot.create") name = r.payload.identity.official_name;
      if (r.kind === "spot.section" && r.payload.section === "identity") {
        name = r.payload.data.official_name;
      }
    }
    return name;
  };
  const attention: AttentionRow[] = [];
  const stale: StaleRow[] = [];
  const drafts: DraftRow[] = [];
  const requiredDone = (view: SpotView | null) =>
    view === null ? null : REQUIRED_PARTS.filter((f) => !view.spot.missing.includes(f)).length;
  const flag = (spotId: string, name: string): boolean => {
    const mine = records.filter((r) => r.spot_id === spotId);
    if (mine.some((r) => r.state === "conflict")) {
      attention.push({ spotId, name, reason: "conflict" });
      return true;
    }
    const failed = mine.filter((r) => r.state === "failed").length;
    if (failed > 0) attention.push({ spotId, name, reason: "failed", count: failed });
    return failed > 0;
  };

  for (const s of list?.spots ?? []) {
    const name = nameOf(s.id, s.official_name);
    if (!flag(s.id, name)) {
      if (
        s.review_state === "unreviewed" &&
        s.last_edited_by !== null &&
        s.last_edited_by !== me.id &&
        s.last_edited_by_name !== null
      ) {
        attention.push({ spotId: s.id, name, reason: "unreviewed", editor: s.last_edited_by_name });
      } else if (s.status === "published" && !s.hours_confirmed && term !== null) {
        attention.push({ spotId: s.id, name, reason: "hours_unconfirmed", term: term.name });
      }
    }
    if (s.status === "published") {
      stale.push({ spotId: s.id, name, oldestVerifiedAt: s.oldest_verified_at });
    } else {
      const detail = details.get(s.id) ?? null;
      drafts.push({
        spotId: s.id,
        name,
        localOnly: false,
        requiredDone: requiredDone(buildSpotView(detail, records, s.id, term)),
      });
    }
  }
  for (const r of records) {
    if (r.kind !== "spot.create" || !isLocalId(r.spot_id)) continue;
    const name = nameOf(r.spot_id, r.payload.identity.official_name);
    flag(r.spot_id, name);
    drafts.push({
      spotId: r.spot_id,
      name,
      localOnly: true,
      requiredDone: requiredDone(buildSpotView(null, records, r.spot_id, term)),
    });
  }

  attention.sort(
    (a, b) => REASON_ORDER.indexOf(a.reason) - REASON_ORDER.indexOf(b.reason) || byName(a, b),
  );
  stale.sort(
    (a, b) => (a.oldestVerifiedAt ?? "").localeCompare(b.oldestVerifiedAt ?? "") || byName(a, b),
  );
  drafts.sort(byName);
  return { attention, stale, drafts };
}
```

In `packages/ui-logic/src/survey/index.ts`, add after the `session.ts` line:

```ts
export * from "./view.ts";
```

- [ ] **Step 3: Run the tests**

Run: `bun test packages/ui-logic`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
bun run fix
bun run typecheck && bun run lint && bun test
git add packages/ui-logic
git commit -m "feat(ui-logic): add survey view model with pending writes applied"
```

---

### Task 6: Section forms and conflict diff

**Files:**
- Create: `packages/ui-logic/src/survey/forms.ts`, `packages/ui-logic/test/forms.test.ts`
- Modify: `packages/ui-logic/src/survey/index.ts`

**Interfaces:**
- Produces: `type SectionDraft<S extends SurveySection>` (each payload field may be null), `draftOf<S>(section: S, spot: SurveySpot): SectionDraft<S>`, `type SectionForm<S> = { section; initial; values; errors: Readonly<Record<string, string>>; dirty: boolean }`, `initForm<S>(section, spot): SectionForm<S>`, `setField<S, K>(form, field: K, value): SectionForm<S>`, `type SubmitResult<S> = { ok: true; write: SectionWrite } | { ok: false; form: SectionForm<S> }`, `submitForm<S>(form): SubmitResult<S>`, `type FieldDiff = { field: string; yours: unknown; theirs: unknown }`, `conflictDiff(record: WriteRecord): FieldDiff[]`.
- Consumes: plan A `SectionWrite`, `SectionPayload`; Task 3 `WriteRecord`; builders.

Plan D renders a section editor from `initForm(section, view.spot)`, passes `submitForm(form).write` to `outbox.enqueue`, and shows `conflictDiff(record)` rows with `conflict.yours` and `conflict.theirs`.

- [ ] **Step 1: Write the failing tests**

`packages/ui-logic/test/forms.test.ts`:

```ts
import { expect, test } from "bun:test";
import { surveySpotFixture } from "../../core/test/fixtures/survey-spot.ts";
import { conflictDiff, draftOf, initForm, setField, submitForm } from "../src/index.ts";
import { POWER, SPOT_A, section } from "./builders.ts";

const spot = surveySpotFixture({ id: SPOT_A });

test("drafts come from the spot, and hours use the spot's term", () => {
  expect(draftOf("power", spot)).toEqual({
    outlet_coverage_pct: 0.6,
    usb_outlets: null,
    wifi_mbps: null,
    cell_signal: null,
  });
  expect(draftOf("hours", spot)).toEqual({ term_id: "2026-fall", rows: spot.hours });
  expect(draftOf("hours", { ...spot, term: null }).term_id).toBeNull();
});

test("editing marks the form dirty, and putting the value back clears it", () => {
  const form = initForm("seating", spot);
  const edited = setField(form, "seat_count", 80);
  expect(edited.dirty).toBe(true);
  expect(setField(edited, "seat_count", 120).dirty).toBe(false);
});

test("submit validates with the shared schema and puts errors on fields", () => {
  const empty = setField(initForm("seating", spot), "seat_count", null);
  const failed = submitForm(empty);
  expect(failed.ok).toBe(false);
  if (failed.ok) return;
  expect(Object.keys(failed.form.errors)).toEqual(["seat_count"]);
  const fixed = setField(failed.form, "seat_count", 12);
  expect(fixed.errors).toEqual({});
  const ok = submitForm(fixed);
  expect(ok.ok && ok.write.section).toBe("seating");
});

test("the conflict view lists only fields that differ", () => {
  const current = surveySpotFixture({ id: SPOT_A, version: 4, outlet_coverage_pct: 0.2 });
  const conflicted = section(SPOT_A, POWER, { state: "conflict", current });
  expect(conflictDiff(conflicted)).toEqual([
    { field: "outlet_coverage_pct", yours: 0.5, theirs: 0.2 },
    { field: "cell_signal", yours: "good", theirs: null },
  ]);
  expect(conflictDiff(section(SPOT_A, POWER))).toEqual([]);
});
```

Run: `bun test packages/ui-logic/test/forms.test.ts`
Expected: FAIL with an `Export named '...' not found` SyntaxError (the exports this task adds do not exist yet).

- [ ] **Step 2: Write the forms module**

`packages/ui-logic/src/survey/forms.ts`:

```ts
import {
  type SectionPayload,
  SectionWrite,
  type SurveySection,
  type SurveySpot,
} from "@study-spot/core";
import type { WriteRecord } from "./writes.ts";

/** A section's payload while being edited: any field may still be empty. */
export type SectionDraft<S extends SurveySection> = {
  [K in keyof SectionPayload<S>]: SectionPayload<S>[K] | null;
};

const DRAFT_OF: { [S in SurveySection]: (spot: SurveySpot) => SectionDraft<S> } = {
  identity: (s) => ({
    slug: s.slug,
    official_name: s.official_name,
    common_name: s.common_name,
    building_id: s.building_id,
    floor: s.floor,
    lat: s.lat,
    lng: s.lng,
    directions: s.directions,
    outdoor: s.outdoor,
    seasonal: s.seasonal,
  }),
  access: (s) => ({
    eligibility: s.eligibility,
    eligibility_scope: s.eligibility_scope,
    eligibility_verified: s.eligibility_verified,
    entry_method: s.entry_method,
    reservable: s.reservable,
    reservation_system: s.reservation_system,
    reservation_url: s.reservation_url,
  }),
  hours: (s) => ({ term_id: s.term?.id ?? null, rows: s.hours }),
  seating: (s) => ({
    seat_count: s.seat_count,
    seat_types: s.seat_types,
    table_configs: s.table_configs,
    effective_capacity: s.effective_capacity,
    max_group_size: s.max_group_size,
    spread_out_room: s.spread_out_room,
  }),
  power: (s) => ({
    outlet_coverage_pct: s.outlet_coverage_pct,
    usb_outlets: s.usb_outlets,
    wifi_mbps: s.wifi_mbps,
    cell_signal: s.cell_signal,
  }),
  environment: (s) => ({
    noise_policy: s.noise_policy,
    natural_light: s.natural_light,
    lighting: s.lighting,
    temperature: s.temperature,
    temperature_consistent: s.temperature_consistent,
    windows_view: s.windows_view,
  }),
  use_fit: (s) => ({
    calls_ok: s.calls_ok,
    group_work_ok: s.group_work_ok,
    whiteboard: s.whiteboard,
    food_policy: s.food_policy,
  }),
  amenities: (s) => ({ amenities: s.amenities }),
  accessibility: (s) => ({
    step_free: s.step_free,
    elevator: s.elevator,
    accessible_seating: s.accessible_seating,
  }),
  late_night: (s) => ({
    open_past_midnight: s.open_past_midnight,
    staffed_late: s.staffed_late,
    lit_route_to_residences: s.lit_route_to_residences,
  }),
  estimates: (s) => ({
    cells: s.estimates.map(({ day_type, block, bucket }) => ({ day_type, block, bucket })),
  }),
};

/** The editor's starting values for one section of a spot (use the SpotView's merged spot). */
export function draftOf<S extends SurveySection>(section: S, spot: SurveySpot): SectionDraft<S> {
  return DRAFT_OF[section](spot);
}

export type SectionForm<S extends SurveySection> = {
  section: S;
  initial: SectionDraft<S>;
  values: SectionDraft<S>;
  /** Field name to message; "" holds errors not tied to one field. */
  errors: Readonly<Record<string, string>>;
  dirty: boolean;
};

export function initForm<S extends SurveySection>(section: S, spot: SurveySpot): SectionForm<S> {
  const initial = draftOf(section, spot);
  return { section, initial, values: initial, errors: {}, dirty: false };
}

export function setField<S extends SurveySection, K extends keyof SectionDraft<S>>(
  form: SectionForm<S>,
  field: K,
  value: SectionDraft<S>[K],
): SectionForm<S> {
  const values = { ...form.values, [field]: value };
  const { [String(field)]: _cleared, ...errors } = form.errors;
  return {
    ...form,
    values,
    errors,
    dirty: JSON.stringify(values) !== JSON.stringify(form.initial),
  };
}

export type SubmitResult<S extends SurveySection> =
  | { ok: true; write: SectionWrite }
  | { ok: false; form: SectionForm<S> };

/** Validates with the shared section schema; on failure, errors land on their fields. */
export function submitForm<S extends SurveySection>(form: SectionForm<S>): SubmitResult<S> {
  const parsed = SectionWrite.safeParse({ section: form.section, data: form.values });
  if (parsed.success) return { ok: true, write: parsed.data };
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key =
      issue.path[0] === "data" && issue.path[1] !== undefined ? String(issue.path[1]) : "";
    errors[key] ??= issue.message;
  }
  return { ok: false, form: { ...form, errors } };
}

export type FieldDiff = { field: string; yours: unknown; theirs: unknown };

/**
 * The conflict view's rows: each field of the queued section write that differs
 * from the server's spot. Verify and review conflicts have no field rows.
 */
export function conflictDiff(record: WriteRecord): FieldDiff[] {
  if (record.kind !== "spot.section" || record.current === null) return [];
  const yours: Record<string, unknown> = record.payload.data;
  const theirs: Record<string, unknown> = draftOf(record.payload.section, record.current);
  return Object.keys(yours).flatMap((field) =>
    JSON.stringify(yours[field]) === JSON.stringify(theirs[field])
      ? []
      : [{ field, yours: yours[field], theirs: theirs[field] }],
  );
}
```

In `packages/ui-logic/src/survey/index.ts`, add after the `api.ts` line:

```ts
export * from "./forms.ts";
```

- [ ] **Step 3: Run the tests**

Run: `bun test packages/ui-logic`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
bun run fix
bun run typecheck && bun run lint && bun test
git add packages/ui-logic
git commit -m "feat(ui-logic): add section form state and conflict diff"
```

---

### Task 7: Typed copy module from the deck

**Files:**
- Create: `packages/ui-logic/test/copyDeck.ts`, `packages/ui-logic/test/gen-copy.ts`, `packages/ui-logic/test/copy.test.ts`
- Create: `packages/ui-logic/src/copy/index.ts`, `packages/ui-logic/src/copy/copy.gen.ts` (generated)
- Modify: `packages/ui-logic/src/index.ts`, `package.json`, `docs/design/surveyor-copy.md`, `docs/context/overview.md`

**Interfaces:**
- Produces: `COPY` (id to text, `as const`), `COPY_MAX` (id to max chars), `type CopyId`, `type CopyParam<K>`, `type CopyParams<K> = Record<CopyParam<K>, string | number>`, `t<K extends CopyId>(id: K, ...args: CopyParam<K> extends never ? [] : [CopyParams<K>]): string`.
- Produces (tests): `type CopyRow = { id: string; text: string; max: number }`, `parseCopyDeck(markdown: string): CopyRow[]`, `renderCopyModule(rows: readonly CopyRow[]): string`; root script `copy:gen`.
- Consumes: `docs/design/surveyor-copy.md`.

- [ ] **Step 1: Write the deck parser, generator, and failing test**

`packages/ui-logic/test/copyDeck.ts`:

```ts
/** One row of a copy deck table: `| id | text | max chars | notes |`. */
export type CopyRow = { id: string; text: string; max: number };

const ROW = /^\| ([a-z0-9_.]+) \| (.*) \| (\d+) \| .*\|$/;

/** Every copy row in docs/design/surveyor-copy.md, in deck order. */
export function parseCopyDeck(markdown: string): CopyRow[] {
  const rows: CopyRow[] = [];
  for (const line of markdown.split("\n")) {
    const m = ROW.exec(line);
    if (m?.[1] !== undefined && m[2] !== undefined && m[3] !== undefined) {
      rows.push({ id: m[1], text: m[2], max: Number(m[3]) });
    }
  }
  return rows;
}

/** The source of packages/ui-logic/src/copy/copy.gen.ts. */
export function renderCopyModule(rows: readonly CopyRow[]): string {
  const text = rows.map((r) => `  ${JSON.stringify(r.id)}: ${JSON.stringify(r.text)},`);
  const max = rows.map((r) => `  ${JSON.stringify(r.id)}: ${r.max},`);
  return [
    "// Generated from docs/design/surveyor-copy.md by `bun run copy:gen`. Do not edit.",
    "",
    "export const COPY = {",
    ...text,
    "} as const;",
    "",
    "export const COPY_MAX = {",
    ...max,
    "} as const satisfies Record<keyof typeof COPY, number>;",
    "",
  ].join("\n");
}
```

`packages/ui-logic/test/gen-copy.ts`:

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCopyDeck, renderCopyModule } from "./copyDeck.ts";

const deck = fileURLToPath(new URL("../../../docs/design/surveyor-copy.md", import.meta.url));
const out = fileURLToPath(new URL("../src/copy/copy.gen.ts", import.meta.url));
const rows = parseCopyDeck(readFileSync(deck, "utf8"));
writeFileSync(out, renderCopyModule(rows));
console.log(`wrote ${rows.length} strings to ${out}`);
```

`packages/ui-logic/test/copy.test.ts`:

```ts
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { COPY, COPY_MAX, type CopyId, t } from "../src/index.ts";
import { parseCopyDeck } from "./copyDeck.ts";

const deck = parseCopyDeck(
  readFileSync(
    fileURLToPath(new URL("../../../docs/design/surveyor-copy.md", import.meta.url)),
    "utf8",
  ),
);

/**
 * Realistic values for every placeholder in the deck. Names are a typical
 * display name; the deck's max chars assume names up to about 20 characters.
 */
const SAMPLE: Readonly<Record<string, string>> = {
  count: "12",
  date: "Oct 15",
  field: "outlet coverage",
  fields: "directions, seat count",
  meters: "120",
  minutes: "15",
  name: "Jordan Rivera",
  percent: "100",
  reason: "seat count is required",
  section: "Power and signal",
  spot: "SAC Lounge",
  term: "Fall 2026",
  time: "Oct 15, 3:40 PM",
  what: "Power and signal for SAC Lounge",
};

const ids = Object.keys(COPY) as CopyId[];

test("the module holds exactly the deck's strings and limits", () => {
  expect(deck.length).toBeGreaterThan(300);
  expect(new Set(deck.map((r) => r.id)).size).toBe(deck.length);
  const text: Record<string, string> = COPY;
  const max: Record<string, number> = COPY_MAX;
  expect(text).toEqual(Object.fromEntries(deck.map((r) => [r.id, r.text])));
  expect(max).toEqual(Object.fromEntries(deck.map((r) => [r.id, r.max])));
});

const EM_DASH = String.fromCodePoint(0x2014);

test("no string has an em-dash or an exclamation mark", () => {
  for (const id of ids) {
    expect(COPY[id].includes(EM_DASH)).toBe(false);
    expect(COPY[id].includes("!")).toBe(false);
  }
});

test("every string fits its max chars with representative params", () => {
  for (const id of ids) {
    const rendered = COPY[id].replace(/\{(\w+)\}/g, (_m, name: string) => {
      const value = SAMPLE[name];
      if (value === undefined) throw new Error(`no sample for {${name}} in ${id}`);
      return value;
    });
    expect({ id, length: rendered.length }).toEqual({
      id,
      length: Math.min(rendered.length, COPY_MAX[id]),
    });
  }
});

test("t fills typed params and leaves plain strings alone", () => {
  expect(t("common.save")).toBe("Save");
  expect(t("sync.pending", { count: 3 })).toBe("3 waiting to sync");
  expect(
    t("admin.publish.warning.item", { name: "SAC Lounge", reason: "missing directions" }),
  ).toBe("SAC Lounge: missing directions");
  // @ts-expect-error sync.pending needs { count }
  t("sync.pending");
  // @ts-expect-error common.save takes no params
  t("common.save", { count: 1 });
});
```

Run: `bun test packages/ui-logic/test/copy.test.ts`
Expected: FAIL with an `Export named '...' not found` SyntaxError (the exports this task adds do not exist yet).

- [ ] **Step 2: Update the deck**

In `docs/design/surveyor-copy.md`, replace:

```
Plan D moves these strings into a typed copy module in `packages/ui-logic`; ids here are the keys.
```

with:

```
Plan B moves these strings into a typed copy module in `packages/ui-logic` (`bun run copy:gen`); ids here are the keys, and a test keeps the two identical.
```

Replace:

```
| sync.what.photo | Photo for {name} | 50 | |
```

with:

```
| sync.what.photo | Photo for {name} | 50 | |
| sync.what.review | Review {name} | 50 | |
| sync.what.cover | Cover photo for {name} | 50 | |
```

Replace:

```
| conflict.body | {name} changed this while your edit was waiting. Pick which version to keep. | 80 | name = last editor from the 409 body |
```

with:

```
| conflict.body | {name} changed this while your edit was waiting. Pick which version to keep. | 90 | name = last editor from the 409 body |
```

- [ ] **Step 3: Add the script, generate, and write `t`**

In the root `package.json` `scripts`, add after `"test": "bun test",`:

```json
    "copy:gen": "bun packages/ui-logic/test/gen-copy.ts",
```

`packages/ui-logic/src/copy/index.ts`:

```ts
import { COPY } from "./copy.gen.ts";

export { COPY, COPY_MAX } from "./copy.gen.ts";

export type CopyId = keyof typeof COPY;

/** The `{name}` placeholders in a copy string, as a union of names. */
type ParamsOf<S extends string> = S extends `${string}{${infer P}}${infer Rest}`
  ? P | ParamsOf<Rest>
  : never;
export type CopyParam<K extends CopyId> = ParamsOf<(typeof COPY)[K]>;
export type CopyParams<K extends CopyId> = Record<CopyParam<K>, string | number>;

/**
 * Renders a copy string. Strings with placeholders require exactly their params:
 * t("sync.pending", { count: 3 }); t("common.save").
 */
export function t<K extends CopyId>(
  id: K,
  ...args: CopyParam<K> extends never ? [] : [CopyParams<K>]
): string {
  const text: string = COPY[id];
  const params: Readonly<Record<string, string | number>> = args[0] ?? {};
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}
```

In `packages/ui-logic/src/index.ts`, replace:

```ts
export * from "./contrast.ts";
```

with:

```ts
export * from "./contrast.ts";
export * from "./copy/index.ts";
```

Run: `bun run copy:gen && bun run fix`
Expected: `wrote 334 strings to .../packages/ui-logic/src/copy/copy.gen.ts`.

- [ ] **Step 4: Run the tests**

Run: `bun test packages/ui-logic`
Expected: PASS.

- [ ] **Step 5: Record the decisions**

In `docs/context/overview.md`, append to the decision log, numbered after the last entry (16 when plan A's decision 15 is present, else 15):

```
16. Surveyor client logic plan (2026-10-04), detail in `docs/superpowers/plans/2026-10-04-surveyor-2a-client-logic.md`: `packages/ui-logic` gains `Http`, `BinaryCache`, `Ids`, `Timers`, and `Foreground` adapters (browser globals do not type-check there); the outbox stores one record per write, orders by a monotonic `seq`, sends a draft's create before its photos and its photos before its text, chains `base_version` from each response, holds a spot's text behind its failed or conflicted writes, and treats an unparseable 2xx as failed; covers are set only on synced photos; admin actions are online-only; hours stay out of "Needed to publish" (plan A rule); React hooks live in the web UI plan; the copy module is generated from the copy deck by `bun run copy:gen`, which adds `sync.what.review` and `sync.what.cover` and raises `conflict.body` to 90 characters.
```

- [ ] **Step 6: Commit**

```bash
bun run fix
bun run typecheck && bun run lint && bun test
git add package.json docs/design/surveyor-copy.md docs/context/overview.md packages/ui-logic
git commit -m "feat(ui-logic): add typed copy module generated from the deck"
```

---

## Done criteria

- `bun run typecheck && bun run lint && bun test` pass on the last commit.
- Every plan A route has a client function returning `ApiResult`, and every 2xx body is parsed with its core schema.
- The `missingV0Fields` parity test passes: with nothing queued, the phone's missing list equals the server's (spec section 10).
- The outbox tests cover ordering, temporary id rewrite, version chaining, 409, 422, 401 pause, backoff, and the five Review Focus conditions (spec section 10).
- `COPY` equals the deck exactly, with no em-dash or exclamation mark, and every string fits its max chars with the sample params.
- Plan D can build every surveyor screen from `createSurveyApi`, `createSessionStore`, `createOutbox`, the view functions, the form functions, and `t`, adding only browser adapters, hooks, and components.

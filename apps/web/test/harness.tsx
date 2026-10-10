import {
  type Bundle,
  type CampusInfo,
  parseBundle,
  type SpotList,
  type SpotSummary,
  type SurveyorPublic,
  type SurveySpot,
} from "@perch/core";
import {
  type BundleState,
  createOutbox,
  createSessionStore,
  createSurveyApi,
  type FetchResponse,
  type Http,
  type HttpRequest,
  type ReadyLoad,
} from "@perch/ui-logic";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { type RenderResult, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { z } from "zod";
import { makeBundleFixture } from "../../../packages/core/test/fixtures/bundle-v1.ts";
import { staticBundleStore } from "../../../packages/ui-logic/test/fakeBundleStore.ts";
import { FakeSurveyServer } from "../../../packages/ui-logic/test/fakeServer.ts";
import {
  FakeForeground,
  FakeNetwork,
  FakeTimers,
  MemoryBinary,
  MemoryCache,
  MemoryStorage,
  mutableClock,
  sequentialIds,
} from "../../../packages/ui-logic/test/fakes.ts";
import { AppProvider } from "../src/app/AppProvider.tsx";
import { createAuthState } from "../src/app/authState.ts";
import {
  type AppDeps,
  createQueryClient,
  createSignOut,
  createSurveyPersister,
  resumeOnNewSession,
} from "../src/app/deps.ts";
import { applyServerSpot } from "../src/app/serverCache.ts";
import { createSessionState } from "../src/app/sessionState.ts";
import { defaultViewTransition } from "../src/app/transitions.ts";
import { browserImageKit } from "../src/lib/photo.ts";
import { routeTree } from "../src/routeTree.gen.ts";

export const API = "https://api.example";
export type PendingPhoto = {
  id: string;
  spot_id: string;
  url: string | null;
  taken_at: string;
  is_cover: boolean;
  uploaded_by: string | null;
  approved: boolean;
  approved_at: string | null;
  spot_name: string;
  uploaded_by_name: string | null;
};
const Invite = z.object({ role: z.string(), surveyor_id: z.string().optional() });
export const TOKEN = "a".repeat(43);
export const ME: SurveyorPublic = {
  id: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
  display_name: "Ana",
  role: "surveyor",
  active: true,
};
export const CAMPUS: CampusInfo = {
  campus: { id: "sbu", name: "Stony Brook University", tz: "America/New_York" },
  buildings: [
    { id: "melville-library", name: "Melville Library", lat: 40.9154, lng: -73.1222 },
    { id: "sac", name: "Student Activities Center", lat: 40.9146, lng: -73.1236 },
  ],
};

export function summary(spot: SurveySpot): SpotSummary {
  return {
    id: spot.id,
    slug: spot.slug,
    official_name: spot.official_name,
    common_name: spot.common_name,
    building_id: spot.building_id,
    building_name: "Melville Library",
    status: spot.status,
    review_state: spot.review_state,
    version: spot.version,
    last_edited_by: spot.last_edited_by,
    last_edited_by_name: spot.last_edited_by_name,
    updated_at: spot.updated_at,
    oldest_verified_at: Object.values(spot.verified).sort()[0] ?? null,
    hours_confirmed: spot.hours.length > 0,
    cover_photo_id: spot.photos.find((p) => p.is_cover && p.approved)?.id ?? null,
  };
}

/** Plan A's routes in memory: the ui-logic fake server plus the list and campus reads. */
export class TestServer implements Http {
  readonly inner: FakeSurveyServer;
  offline = false;
  unauthorized = false;
  readonly reads: string[] = [];
  /** Admin routes, answered from this state. */
  readonly admin: {
    surveyors: SurveyorPublic[];
    invites: z.infer<typeof Invite>[];
    published: number;
    warnings: string[];
    photos: PendingPhoto[];
    publishFails: boolean;
    /** Report a never-published bundle as not dirty, as the server does before any write. */
    neverDirty: boolean;
    /** Another process holds the publish lease until this time. */
    waitingUntil: string | null;
    inviteGate: Promise<void> | null;
    /** Holds the spot list answer until it settles. */
    listGate: Promise<void> | null;
    /** Holds every spot detail read until it settles. */
    spotGate: Promise<void> | null;
    /** Holds the surveyor list answer until it settles. */
    surveyorsGate: Promise<void> | null;
    /** Holds approve and reject answers until it settles. */
    reviewGate: Promise<void> | null;
    /** Approve and reject requests received. */
    reviews: number;
  } = {
    surveyors: [],
    invites: [],
    published: 0,
    warnings: [],
    photos: [],
    publishFails: false,
    neverDirty: false,
    waitingUntil: null,
    inviteGate: null,
    listGate: null,
    spotGate: null,
    surveyorsGate: null,
    reviewGate: null,
    reviews: 0,
  };
  constructor(spots: SurveySpot[]) {
    this.inner = new FakeSurveyServer(spots);
  }
  list(): SpotList {
    return {
      term: { id: "2026-fall", name: "Fall 2026" },
      spots: [...this.inner.spots.values()].map(summary),
    };
  }
  async send(req: HttpRequest): Promise<FetchResponse> {
    if (this.offline) throw new Error("network down");
    const path = req.url.slice(API.length);
    if (this.unauthorized) return { status: 401, text: '{"error":"unauthorized"}' };
    if (req.method === "GET") this.reads.push(path);
    if (req.method === "GET" && path === "/survey/spots") {
      if (this.admin.listGate !== null) await this.admin.listGate;
      return { status: 200, text: JSON.stringify(this.list()) };
    }
    if (req.method === "GET" && /^\/survey\/spots\/[^/]+$/.test(path) && this.admin.spotGate) {
      await this.admin.spotGate;
    }
    if (req.method === "GET" && path === "/admin/surveyors" && this.admin.surveyorsGate) {
      await this.admin.surveyorsGate;
    }
    if (req.method === "GET" && path === "/survey/campus") {
      return { status: 200, text: JSON.stringify(CAMPUS) };
    }
    if (path === "/admin/invites" && this.admin.inviteGate !== null) await this.admin.inviteGate;
    if (req.method === "POST" && /^\/survey\/photos\/[^/]+\/(approve|reject)$/.test(path)) {
      this.admin.reviews += 1;
      if (this.admin.reviewGate !== null) await this.admin.reviewGate;
    }
    const admin = this.adminRoute(
      req.method,
      path,
      req.body?.kind === "json" ? req.body.json : null,
    );
    if (admin !== null) return admin;
    const unpublish = /^\/survey\/spots\/([^/]+)\/unpublish$/.exec(path);
    if (unpublish?.[1] !== undefined && req.method === "POST") {
      // Like the server: an unpublish is a write and bumps the version.
      const spot = this.inner.bump(unpublish[1], { status: "draft" });
      return { status: 200, text: JSON.stringify(spot) };
    }
    return this.inner.send(req);
  }

  /** Admin routes, answered from `admin`. Null when the path is not an admin route. */
  private adminRoute(method: string, path: string, json: string | null): FetchResponse | null {
    const ok = (body: unknown): FetchResponse => ({ status: 200, text: JSON.stringify(body) });
    if (path === "/admin/invites" && method === "POST") {
      const body = Invite.parse(JSON.parse(json ?? "{}"));
      this.admin.invites.push(body);
      const hint = body.surveyor_id === undefined ? "" : "?relogin=1";
      return ok({
        url: `https://perch.example/invite/${"d".repeat(43)}${hint}`,
        expires_at: "2026-10-15T18:00:00.000Z",
      });
    }
    if (path === "/admin/surveyors" && method === "GET") {
      return ok({
        surveyors: this.admin.surveyors.map((s) => ({
          ...s,
          created_at: "2026-10-01T00:00:00.000Z",
        })),
      });
    }
    const revoke = /^\/admin\/surveyors\/([^/]+)\/revoke$/.exec(path);
    if (revoke !== null && method === "POST") {
      const s = this.admin.surveyors.find((x) => x.id === revoke[1]);
      if (s === undefined) return { status: 404, text: '{"error":"not_found"}' };
      s.active = false;
      return ok(s);
    }
    if (path === "/admin/publish") {
      if (method === "POST" && this.admin.publishFails) {
        return { status: 500, text: '{"error":"internal"}' };
      }
      if (method === "POST") this.admin.published += 1;
      const published = this.admin.published > 0;
      return ok({
        dirty: this.admin.neverDirty ? false : !published,
        running: false,
        last_published_at: published ? "2026-10-13T18:00:00.000Z" : null,
        last_hash: null,
        last_attempt_at: null,
        warnings: this.admin.warnings,
        last_error: null,
        waiting_until: this.admin.waitingUntil,
      });
    }
    if (path === "/admin/photos/pending") return ok({ photos: this.admin.photos });
    const review = /^\/survey\/photos\/([^/]+)\/(approve|reject)$/.exec(path);
    if (review !== null && method === "POST") {
      const photo = this.admin.photos.find((p) => p.id === review[1]);
      if (photo === undefined) return { status: 404, text: '{"error":"not_found"}' };
      this.admin.photos = this.admin.photos.filter((p) => p.id !== photo.id);
      // Like the server: approving or rejecting is a write and bumps the version.
      return ok(this.inner.bump(photo.spot_id));
    }
    return null;
  }
}

export type TestApp = {
  deps: AppDeps;
  server: TestServer;
  network: FakeNetwork;
  timers: FakeTimers;
  clock: ReturnType<typeof mutableClock>;
  cache: MemoryCache;
  /** The session's storage, shared with a second store to act as another tab. */
  storage: MemoryStorage;
  /** Spot ids the app reported through `deps.pickPing`, in order. */
  pings: string[];
};

/** App dependencies on fakes: in-memory storage, the fake server, manual timers. */
export function testApp(
  opts: {
    spots?: SurveySpot[];
    me?: SurveyorPublic | null;
    now?: string;
    /** The student bundle state. Default: ready with the v1 fixture, fresh, age 0. */
    bundle?: BundleState;
    /** Random source for picks. Default: seeded, so picks repeat. */
    rand?: () => number;
  } = {},
): TestApp {
  const server = new TestServer(opts.spots ?? []);
  const cache = new MemoryCache();
  const blobs = new MemoryBinary();
  const network = new FakeNetwork();
  const timers = new FakeTimers();
  const clock = mutableClock(opts.now ?? "2026-10-13T18:00:00Z");
  const storage = new MemoryStorage();
  const pings: string[] = [];
  const session = createSessionState(createSessionStore(storage));
  const me = opts.me === undefined ? ME : opts.me;
  if (me !== null) session.save({ token: TOKEN, surveyor: me });
  const api = createSurveyApi({ http: server, baseUrl: API, token: () => session.token() });
  const outbox = createOutbox({
    cache,
    blobs,
    api,
    clock,
    ids: sequentialIds("9000"),
    timers,
    network,
    foreground: new FakeForeground(),
  });
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({
    queries: { ...queryClient.getDefaultOptions().queries, retry: false },
  });
  outbox.onApplied((spot) => applyServerSpot(queryClient, spot));
  const auth = createAuthState();
  const persister = createSurveyPersister(cache);
  resumeOnNewSession({ session, auth, outbox, queryClient });
  const deps: AppDeps = {
    api,
    session,
    auth,
    outbox,
    signOut: createSignOut({ cache, session, outbox, queryClient, persister }),
    started: outbox.start(),
    queryClient,
    persister,
    cache,
    blobs,
    network,
    geolocation: { current: async () => null },
    imageKit: browserImageKit,
    share: { share: async () => "copied" },
    clock,
    apiBaseUrl: API,
    dataBaseUrl: "https://data.example",
    bundle: staticBundleStore(opts.bundle ?? readyBundle(), () => clock.now()),
    prefs: new MemoryStorage(),
    tab: new MemoryStorage(),
    rand: opts.rand ?? seededRand(1),
    pickPing: (spotId) => {
      pings.push(spotId);
    },
  };
  return { deps, server, network, timers, clock, cache, storage, pings };
}

/**
 * Deterministic [0, 1) generator. Same algorithm as `mulberry32` in
 * packages/core/test/prng.ts (Phase A); swap to that import once it lands.
 */
export function seededRand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A ready bundle state around `bundle` (default: the v1 fixture), fresh and age 0. */
export function readyBundle(bundle: Bundle = fixtureBundle()): BundleState {
  const load: ReadyLoad = {
    status: "fresh",
    bundle,
    ageDays: 0,
    updateAvailable: false,
    skewMs: 0,
    networkFailed: false,
  };
  return { phase: "ready", load, refreshing: false, checkFailed: false };
}

function fixtureBundle(): Bundle {
  const parsed = parseBundle(makeBundleFixture());
  if (!parsed.ok) throw new Error(`bundle fixture invalid: ${parsed.detail}`);
  return parsed.bundle;
}

export function renderApp(app: TestApp, ui: ReactNode): RenderResult {
  return render(<AppProvider deps={app.deps}>{ui}</AppProvider>);
}

/** The real route tree at `path`, on fakes, as a phone would open it. */
export function renderRoute(app: TestApp, path: string): RenderResult & { router: TestRouter } {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultViewTransition,
  });
  const result = render(
    <AppProvider deps={app.deps}>
      <RouterProvider router={router} />
    </AppProvider>,
  );
  return { ...result, router };
}
type TestRouter = ReturnType<typeof createRouter<typeof routeTree>>;

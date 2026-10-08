import type {
  CampusInfo,
  SpotList,
  SpotSummary,
  SurveyorPublic,
  SurveySpot,
} from "@study-spot/core";
import {
  createOutbox,
  createSessionStore,
  createSurveyApi,
  type FetchResponse,
  type Http,
  type HttpRequest,
} from "@study-spot/ui-logic";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { type RenderResult, render } from "@testing-library/react";
import type { ReactNode } from "react";
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
import { browserImageKit } from "../src/lib/photo.ts";
import { routeTree } from "../src/routeTree.gen.ts";

export const API = "https://api.example";
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
  };
}

/** Plan A's routes in memory: the ui-logic fake server plus the list and campus reads. */
export class TestServer implements Http {
  readonly inner: FakeSurveyServer;
  offline = false;
  unauthorized = false;
  readonly reads: string[] = [];
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
      return { status: 200, text: JSON.stringify(this.list()) };
    }
    if (req.method === "GET" && path === "/survey/campus") {
      return { status: 200, text: JSON.stringify(CAMPUS) };
    }
    const unpublish = /^\/survey\/spots\/([^/]+)\/unpublish$/.exec(path);
    if (unpublish?.[1] !== undefined && req.method === "POST") {
      const spot = { ...this.inner.spot(unpublish[1]), status: "draft" as const };
      this.inner.spots.set(spot.id, spot);
      return { status: 200, text: JSON.stringify(spot) };
    }
    return this.inner.send(req);
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
};

/** App dependencies on fakes: in-memory storage, the fake server, manual timers. */
export function testApp(
  opts: { spots?: SurveySpot[]; me?: SurveyorPublic | null; now?: string } = {},
): TestApp {
  const server = new TestServer(opts.spots ?? []);
  const cache = new MemoryCache();
  const blobs = new MemoryBinary();
  const network = new FakeNetwork();
  const timers = new FakeTimers();
  const clock = mutableClock(opts.now ?? "2026-10-13T18:00:00Z");
  const storage = new MemoryStorage();
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
    signOut: createSignOut({ session, outbox, queryClient, persister }),
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
  };
  return { deps, server, network, timers, clock, cache, storage };
}

export function renderApp(app: TestApp, ui: ReactNode): RenderResult {
  return render(<AppProvider deps={app.deps}>{ui}</AppProvider>);
}

/** The real route tree at `path`, on fakes, as a phone would open it. */
export function renderRoute(app: TestApp, path: string): RenderResult & { router: TestRouter } {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const result = render(
    <AppProvider deps={app.deps}>
      <RouterProvider router={router} />
    </AppProvider>,
  );
  return { ...result, router };
}
type TestRouter = ReturnType<typeof createRouter<typeof routeTree>>;

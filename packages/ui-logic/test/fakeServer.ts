import { IdentitySection, SurveySpot } from "@perch/core";
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
  /** Spot ids whose requests answer 500 until removed. */
  readonly failFor = new Set<string>();
  offline = false;
  signedOut = false;
  /** Runs the next request, then drops its answer like a connection cut mid-reply. */
  dropNextResponse = false;
  private hold: Promise<void> | null = null;
  private arrive: (() => void) | null = null;
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

  /**
   * Holds the next request in flight: `arrived` resolves once it reaches the
   * server, and it is answered (as the server is then) after `release()`.
   */
  holdNext(): { arrived: Promise<void>; release: () => void } {
    let release = () => {};
    this.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const arrived = new Promise<void>((resolve) => {
      this.arrive = resolve;
    });
    return { arrived, release };
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
    if (this.hold) {
      const hold = this.hold;
      this.hold = null;
      this.arrive?.();
      await hold;
    }
    if (this.offline) throw new Error("network down");
    const status = this.failWith.shift();
    if (status !== undefined) return reply(status, { error: "internal" });
    if ([...this.failFor].some((id) => path.includes(id) || body.spot_id === id)) {
      return reply(500, { error: "internal" });
    }
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
      if (String(body.spot_id).startsWith("local:"))
        return reply(400, { error: "invalid_request" });
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

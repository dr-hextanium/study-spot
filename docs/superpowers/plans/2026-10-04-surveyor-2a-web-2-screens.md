# Surveyor 2a Web UI Implementation Plan (Plan D), Part 2 of 3: Spot Screens

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Start after part 1 (`2026-10-04-surveyor-2a-web-1-foundation.md`) is merged; part 3 (`2026-10-04-surveyor-2a-web-3-finish.md`) follows.

**Goal:** A surveyor can do the whole spot job on a phone, offline included: create a spot (building picker that remembers the last building, optional location), see its ruled overview (required sections first, postmark rings, stamps), fill and check every section (Basics, Access, Hours with copy-to-weekdays and finals, Seating, Power and signal, Noise and feel, House rules, Nearby, Accessibility, Late night, Busyness grid, Photos with on-device resize and the postcard checklist), publish with the blockers listed as links, mark a teammate's spot reviewed, resolve a conflict both ways, retry or discard a failed change, and, as an admin, unpublish. Spec acceptance items 1, 3, and 4 pass end to end against the real server.

**Architecture:** Pure helpers in `src/lib/` (slug, hours week model, estimates grid, photo resize, field labels and value text, spot point) and three hooks (`useSpotView` over `buildSpotView`, `sectionStatuses`, `publishReadiness`, `reviewAction`; `useSectionForm` over `initForm`, `setField`, `submitForm`, with the unpublish warning; `usePhotoUrl` for signed image bytes). Screens compose part 1's components. Every section editor is one `EditorShell` (fields, Save pinned at the bottom, "Checked, nothing changed", a leave guard through TanStack's `useBlocker`, the unpublish confirm) around a few field components; Hours, Busyness, and Photos are their own editors. The conflict and failed views are sheets opened by `?write=<client_write_id>` on the overview, so the back button closes them. Saves go to the outbox; toasts follow the write (part 1). Unpublish and photo approval are online calls.

**Tech Stack:** as part 1 (React 19.3, TanStack Router 1.170 with `useBlocker`, TanStack Query 5.104, Vitest 5 with jsdom, Playwright 1.63), plus browser `createImageBitmap` (`imageOrientation: "from-image"`) and canvas JPEG encoding for photos.

**Spec:** `docs/superpowers/specs/2026-10-04-surveyor-tooling-design.md` sections 7 (screens, photo pipeline, local state), 10 (web tests), 12 (acceptance 1, 3, 4). Journey: `docs/design/surveyor-journey.md` B, C, D and edge points 1 to 6, 10, 11. Copy: `docs/design/surveyor-copy.md` (all ids already added in part 1, Task 3). Contract: `apps/web/.impeccable/surfaces/apps-web.md` (first viewport, stamping).

## Global Constraints

Part 1's constraints hold unchanged: strict TypeScript with no `any`, no `!`, no enums; `.ts`/`.tsx` import extensions; Zod at trust boundaries (here: route params and search); copy only through `t()` and `plural()`; CSS only from token variables, 44 px targets, shadows only on sheets; no em-dashes; Conventional Commits under 72 characters with no attribution; every commit passes `bun run typecheck && bun run lint && bun test && bun run --filter '@study-spot/web' test` after `bun run fix`.

## Review Focus

1. **A spot created and filled entirely offline, then synced.** Its writes queue under a `local:` id, the overview opens on that id and moves to the real id once the create lands, Basics on a refused create rewrites the create, and publish queues with the honest toast ("It goes live after this phone syncs"). Tests: Task 12 (`spot.test.tsx`: "a new spot is created on the phone… then moves to its real id"), Task 11 (`hooks.test.tsx`: "a draft made on this phone… redirects once created"), Task 13 (`spots.e2e.ts`: acceptance 1).
2. **Two phones editing one section.** The second sync conflicts; the overview banner opens the field-by-field view; Keep mine resends on the server's version and Keep theirs drops the edit, with nothing overwritten silently. Tests: Task 12 ("a conflict resolves both ways from the overview"), Task 13 (acceptance 4 with two browser contexts).
3. **A photo with EXIF and GPS from a 12 MP camera.** It must land as a JPEG of at most 1600 px and 1.5 MB with no EXIF block and no trace of the GPS text, retrying once at 0.7 when needed. Tests: Task 11 (`lib.test.ts`: "photos fit within 1600 px…", "an encode over 1.5 MB retries once at 0.7"), Task 13 (acceptance 1 reads the stored bytes back from the image route).
4. **A required field cleared on a published spot.** The server accepts it and the spot silently leaves the student app; the editor names the fields and asks first. Tests: Task 11 ("fieldsCleared names required fields…"), Task 12 ("clearing directions on a published spot warns before saving").
5. **A 360 px phone with a 60-character spot name.** The ink band truncates the name, the sync postmark stays in view, blockers wrap as 44 px links, and nothing scrolls sideways. Tests: Task 13 ("a 60-character spot name at 360 px…").

## File Structure

```
apps/web/src/lib/       slug.ts hours.ts estimates.ts photo.ts fields.ts location.ts
apps/web/src/hooks/     useSpotView.ts useSectionForm.ts usePhotoUrl.ts
apps/web/src/ui/        Choices.tsx (TriState, YesNo, OptionalChoice)
apps/web/src/screens/   BuildingPicker.tsx LocationButton.tsx NewSpot.tsx Overview.tsx WriteSheets.tsx spot.css
apps/web/src/screens/editors/  EditorShell.tsx simple.tsx IdentityEditor.tsx HoursEditor.tsx
                               EstimatesEditor.tsx PhotosEditor.tsx index.tsx
apps/web/src/routes/    survey.spots.new.tsx survey.spots.$id.index.tsx survey.spots.$id.$section.tsx
                        survey.index.tsx (replaced: links and New spot)
apps/web/src/main.tsx   (imports spot.css)
apps/web/test/          lib.test.ts hooks.test.tsx spot.test.tsx
apps/web/e2e/           api.ts photo.ts spots.e2e.ts
```

---
### Task 11: Spot logic: helpers and hooks

Everything the spot screens compute, tested without a screen: slugs, the hours week model (Monday first, closed, 24 hours, one block per day with others kept, past-midnight closes), the estimates grid (cycle and only-set cells), the photo pipeline behind a small `ImageKit` seam (fit within 1600 px, JPEG 0.8, one retry at 0.7, refuse over 1.5 MB), field labels and readable values for the conflict view, the spot point rule; and the hooks `useSpotView`, `useSectionForm` (with `fieldsCleared`), and `usePhotoUrl`.

**Files:**
- Create: `apps/web/src/lib/slug.ts`, `hours.ts`, `estimates.ts`, `photo.ts`, `fields.ts`, `location.ts`
- Create: `apps/web/src/hooks/useSpotView.ts`, `useSectionForm.ts`, `usePhotoUrl.ts`
- Create: `apps/web/test/lib.test.ts`, `apps/web/test/hooks.test.tsx`

**Interfaces:**
- Produces (`lib`): `slugify(text)`, `spotSlug(officialName, buildingId)`; `WEEK_ORDER`, `type DayHours`, `type DayModel = { day; hours: DayHours; extra: HoursRow[] }`, `toWeek(rows, isExam)`, `fromWeek(week, isExam)`, `copyMonday(week)`, `dayProblem(hours): "same_time" | "missing_time" | null`, `closesNextDay(hours)`, `DEFAULT_OPEN`; `type Grid`, `cellKey(day, block)`, `emptyGrid()`, `toGrid(estimates)`, `nextBucket(current)`, `cellsOf(grid)`; `MAX_SIDE`, `QUALITY`, `RETRY_QUALITY`, `fitWithin(w, h, max?)`, `type ImageKit`, `browserImageKit`, `shrinkPhoto(file, kit?): Promise<Shrunk>`; `*_COPY` maps and `*_OPTIONS` lists for every enum, `FIELD_LABEL`, `fieldName(field)`, `valueText(value)`, `fieldValueText(field, value)`; `GOOD_FIX_METERS = 50`, `type LocationState`, `spotPoint(location, building)`.
- Produces (hooks): `useSpotView(id): SpotViewState` (`redirect` | `loading` | `missing` | `ready` with `view`, `statuses`, `readiness`, `review`, `tz`); `fieldsCleared(view, write): V0Field[]`; `useSectionForm(section, view): { form, set, save(opts?), verify }` where `save` resolves `{ kind: "invalid" } | { kind: "confirm"; fields } | { kind: "saved"; clientWriteId }`; `usePhotoUrl({ photoId } | { clientWriteId }): string | null`.
- Consumes: `buildSpotView`, `sectionStatuses`, `publishReadiness`, `reviewAction`, `initForm`, `setField`, `submitForm`, `photoKey`, `missingV0Fields`, `v0InputOf`, `PHOTO_MAX_BYTES`; part 1 hooks and `AppDeps` (`apiBaseUrl`, `blobs`, `session`).

- [ ] **Step 1: Write the failing tests**

`apps/web/test/lib.test.ts`:

```ts
import { PHOTO_MAX_BYTES } from "@study-spot/core";
import { t } from "@study-spot/ui-logic";
import { expect, test } from "vitest";
import { cellsOf, nextBucket, toGrid } from "../src/lib/estimates.ts";
import { fieldValueText, valueText } from "../src/lib/fields.ts";
import { closesNextDay, copyMonday, dayProblem, fromWeek, toWeek } from "../src/lib/hours.ts";
import { GOOD_FIX_METERS, spotPoint } from "../src/lib/location.ts";
import { fitWithin, type ImageKit, shrinkPhoto } from "../src/lib/photo.ts";
import { slugify, spotSlug } from "../src/lib/slug.ts";

test("slugs are lowercase words with single dashes, at most 80 characters", () => {
  expect(slugify("  Café 3rd-Floor  Reading Room! ")).toBe("cafe-3rd-floor-reading-room");
  expect(spotSlug("Central Reading Room", "melville-library")).toBe(
    "central-reading-room-melville-library",
  );
  const long = slugify("word ".repeat(40));
  expect(long.length).toBeLessThanOrEqual(80);
  expect(long.endsWith("-")).toBe(false);
});

test("hours round-trip through the week model, Monday first", () => {
  const rows = [
    { day_of_week: 1, opens: "08:00", closes: "02:00", last_entry: null, is_exam: false },
    { day_of_week: 0, opens: "00:00", closes: "24:00", last_entry: null, is_exam: false },
    { day_of_week: 2, opens: "08:00", closes: "12:00", last_entry: null, is_exam: false },
    { day_of_week: 2, opens: "13:00", closes: "22:00", last_entry: null, is_exam: false },
  ];
  const week = toWeek(rows, false);
  expect(week.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  expect(week[0]?.hours).toEqual({
    kind: "open",
    opens: "08:00",
    closes: "02:00",
    lastEntry: null,
  });
  expect(week[6]?.hours).toEqual({ kind: "all_day" });
  expect(week[2]?.hours).toEqual({ kind: "closed" });
  expect(fromWeek(week, false)).toHaveLength(4);
  expect(closesNextDay(week[0]?.hours ?? { kind: "closed" })).toBe(true);
});

test("copy Monday fills Tuesday to Friday only", () => {
  const week = copyMonday(
    toWeek(
      [{ day_of_week: 1, opens: "09:00", closes: "17:00", last_entry: null, is_exam: false }],
      false,
    ),
  );
  expect(week.filter((d) => d.hours.kind === "open").map((d) => d.day)).toEqual([1, 2, 3, 4, 5]);
});

test("a day cannot open and close at the same time; midnight closing reads as 00:00", () => {
  expect(dayProblem({ kind: "open", opens: "09:00", closes: "09:00", lastEntry: null })).toBe(
    "same_time",
  );
  expect(dayProblem({ kind: "open", opens: "", closes: "09:00", lastEntry: null })).toBe(
    "missing_time",
  );
  const late = toWeek(
    [{ day_of_week: 3, opens: "18:00", closes: "24:00", last_entry: null, is_exam: true }],
    true,
  );
  expect(late[2]?.hours).toEqual({
    kind: "open",
    opens: "18:00",
    closes: "00:00",
    lastEntry: null,
  });
});

test("estimate cells cycle upward and only set cells are sent", () => {
  expect(nextBucket(null)).toBe("empty");
  expect(nextBucket("nearly_full")).toBe("full");
  expect(nextBucket("full")).toBe("empty");
  const grid = toGrid([
    {
      day_type: "weekday",
      block: "evening",
      bucket: "filling",
      created_at: "2026-10-01T00:00:00Z",
    },
  ]);
  expect(cellsOf(grid)).toEqual([{ day_type: "weekday", block: "evening", bucket: "filling" }]);
});

test("values read as the surveyor would say them", () => {
  expect(valueText(null)).toBe(t("common.unknown"));
  expect(valueText(true)).toBe(t("common.yes"));
  expect(valueText("covered_drinks")).toBe(t("use.food.covered_drinks"));
  expect(valueText([{ type: "carrel", count: 0 }])).toBe(t("seating.type.carrel"));
  expect(fieldValueText("outlet_coverage_pct", 0.6)).toBe("60%");
});

test("a rough fix falls back to the building's point", () => {
  const building = { lat: 1, lng: 2 };
  const fix = (accuracyMeters: number) => ({
    kind: "fix" as const,
    fix: { lat: 9, lng: 9, accuracyMeters },
  });
  expect(spotPoint(fix(GOOD_FIX_METERS), building)).toEqual({ lat: 9, lng: 9 });
  expect(spotPoint(fix(GOOD_FIX_METERS + 1), building)).toEqual(building);
  expect(spotPoint({ kind: "denied" }, building)).toEqual(building);
});

test("photos fit within 1600 px on the longest side and never grow", () => {
  expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
  expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
});

function kit(sizes: number[], decodes = true): ImageKit & { qualities: number[] } {
  const qualities: number[] = [];
  return {
    qualities,
    decode: async () =>
      decodes ? { width: 4000, height: 3000, image: {} as CanvasImageSource } : null,
    encode: async (_image, _size, quality) => {
      qualities.push(quality);
      const n = sizes.shift() ?? 0;
      return new Blob([new Uint8Array(n)], { type: "image/jpeg" });
    },
  };
}

test("an encode over 1.5 MB retries once at 0.7, then gives up", async () => {
  const once = kit([PHOTO_MAX_BYTES + 1, 900_000]);
  const ok = await shrinkPhoto(new Blob(), once);
  expect(ok.ok && ok.width).toBe(1600);
  expect(once.qualities).toEqual([0.8, 0.7]);
  expect(await shrinkPhoto(new Blob(), kit([PHOTO_MAX_BYTES + 1, PHOTO_MAX_BYTES + 1]))).toEqual({
    ok: false,
    reason: "too_big",
  });
  expect(await shrinkPhoto(new Blob(), kit([], false))).toEqual({
    ok: false,
    reason: "unreadable",
  });
});
```

`apps/web/test/hooks.test.tsx`:

```tsx
import { buildSpotView } from "@study-spot/ui-logic";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, test } from "vitest";
import { surveySpotFixture } from "../../../packages/core/test/fixtures/survey-spot.ts";
import { identity } from "../../../packages/ui-logic/test/builders.ts";
import { AppProvider } from "../src/app/AppProvider.tsx";
import { fieldsCleared, useSectionForm } from "../src/hooks/useSectionForm.ts";
import { useSpotView } from "../src/hooks/useSpotView.ts";
import { ME, testApp } from "./harness.tsx";

const wrap = (app: ReturnType<typeof testApp>) =>
  function Wrapper(props: { children: ReactNode }) {
    return <AppProvider deps={app.deps}>{props.children}</AppProvider>;
  };

test("a spot this phone never loaded is missing offline, and ready once fetched", async () => {
  const spot = surveySpotFixture();
  const offline = testApp({ spots: [spot] });
  offline.network.set(false);
  offline.server.offline = true;
  const missing = renderHook(() => useSpotView(spot.id), { wrapper: wrap(offline) });
  await waitFor(() => expect(missing.result.current.kind).toBe("missing"));

  const online = testApp({ spots: [spot] });
  const ready = renderHook(() => useSpotView(spot.id), { wrapper: wrap(online) });
  await waitFor(() => expect(ready.result.current.kind).toBe("ready"));
  const state = ready.result.current;
  if (state.kind !== "ready") throw new Error("not ready");
  expect(state.readiness).toEqual({ kind: "ready" });
  expect(state.tz).toBe("America/New_York");
  expect(state.statuses.find((s) => s.section === "identity")?.checkedToday).toBe(false);
});

test("a draft made on this phone shows at once, offers no review, and redirects once created", async () => {
  const app = testApp();
  app.network.set(false);
  await app.deps.started;
  const local = await app.deps.outbox.createSpot(identity({ official_name: "Stairwell Desk" }));
  const view = renderHook(() => useSpotView(local), { wrapper: wrap(app) });
  await waitFor(() => expect(view.result.current.kind).toBe("ready"));
  const state = view.result.current;
  expect(state.kind === "ready" && state.review).toBe("none");
  expect(state.kind === "ready" && state.view.localOnly).toBe(true);

  app.network.set(true);
  await act(() => app.deps.outbox.idle());
  await waitFor(() => expect(view.result.current.kind).toBe("redirect"));
});

test("fieldsCleared names required fields a write would empty on a published spot only", () => {
  const published = buildSpotView(
    surveySpotFixture({ status: "published" }),
    [],
    surveySpotFixture().id,
    null,
  );
  if (published === null) throw new Error("no view");
  const clearing = { section: "identity" as const, data: { ...identity(), directions: null } };
  expect(fieldsCleared(published, clearing)).toEqual(["directions"]);
  const draft = buildSpotView(
    surveySpotFixture({ status: "draft" }),
    [],
    surveySpotFixture().id,
    null,
  );
  if (draft === null) throw new Error("no view");
  expect(fieldsCleared(draft, clearing)).toEqual([]);
});

test("the section form validates with the shared schema, then queues the write", async () => {
  const spot = surveySpotFixture({ seat_count: null, missing: ["seat_count"] });
  const app = testApp({ spots: [spot], me: ME });
  const view = buildSpotView(spot, [], spot.id, null);
  if (view === null) throw new Error("no view");
  const form = renderHook(() => useSectionForm("seating", view), { wrapper: wrap(app) });
  let outcome = await act(() => form.result.current.save());
  expect(outcome).toEqual({ kind: "invalid" });
  expect(form.result.current.form.errors.seat_count).toBeDefined();
  act(() => form.result.current.set("seat_count", 25));
  outcome = await act(() => form.result.current.save());
  expect(outcome.kind).toBe("saved");
  await waitFor(() => expect(app.server.inner.spot(spot.id).seat_count).toBe(25));
  expect(form.result.current.verify).not.toBeNull();
});
```

Run: `bun run --filter '@study-spot/web' test`
Expected: FAIL, the `src/lib` modules and the three hooks do not exist.

- [ ] **Step 2: Write the helpers**

`apps/web/src/lib/slug.ts`:

```ts
const MAX = 80;

/** Lowercase words joined by single dashes, at most 80 characters (the core Slug rule). */
export function slugify(text: string): string {
  const words = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (words.length <= MAX) return words;
  const cut = words.slice(0, MAX);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > 0 ? cut.slice(0, lastDash) : cut).replace(/-+$/, "");
}

/** A new spot's slug: its name and building, so two "Reading Room"s in different buildings differ. */
export function spotSlug(officialName: string, buildingId: string): string {
  return slugify(`${officialName} ${buildingId}`);
}
```

`apps/web/src/lib/hours.ts`:

```ts
import type { HoursRow } from "@study-spot/core";

/** Monday first, as the hours editor lists days; values are day_of_week (0 is Sunday). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export type DayOfWeek = (typeof WEEK_ORDER)[number];

export type DayHours =
  | { kind: "closed" }
  | { kind: "all_day" }
  | { kind: "open"; opens: string; closes: string; lastEntry: string | null };

/** One day of the editor. `extra` keeps further blocks the editor does not show, saved unchanged. */
export type DayModel = { day: DayOfWeek; hours: DayHours; extra: HoursRow[] };

const ALL_DAY_OPENS = "00:00";
const ALL_DAY_CLOSES = "24:00";

function toDay(rows: readonly HoursRow[]): Pick<DayModel, "hours" | "extra"> {
  const sorted = [...rows].sort((a, b) => a.opens.localeCompare(b.opens));
  const [first, ...extra] = sorted;
  if (first === undefined) return { hours: { kind: "closed" }, extra: [] };
  if (first.opens === ALL_DAY_OPENS && first.closes === ALL_DAY_CLOSES) {
    return { hours: { kind: "all_day" }, extra };
  }
  // A time input cannot show 24:00; midnight at the end of the day is 00:00 there.
  const closes = first.closes === ALL_DAY_CLOSES ? "00:00" : first.closes;
  return {
    hours: { kind: "open", opens: first.opens, closes, lastEntry: first.last_entry },
    extra,
  };
}

/** The week for regular hours (isExam false) or finals hours (true). */
export function toWeek(rows: readonly HoursRow[], isExam: boolean): DayModel[] {
  return WEEK_ORDER.map((day) => ({
    day,
    ...toDay(rows.filter((r) => r.day_of_week === day && r.is_exam === isExam)),
  }));
}

export function fromWeek(week: readonly DayModel[], isExam: boolean): HoursRow[] {
  return week.flatMap((d): HoursRow[] => {
    const h = d.hours;
    if (h.kind === "closed") return d.extra;
    const block =
      h.kind === "all_day"
        ? { opens: ALL_DAY_OPENS, closes: ALL_DAY_CLOSES, last_entry: null }
        : { opens: h.opens, closes: h.closes, last_entry: h.lastEntry };
    return [{ day_of_week: d.day, ...block, is_exam: isExam }, ...d.extra];
  });
}

/** Copies Monday's hours to Tuesday through Friday. */
export function copyMonday(week: readonly DayModel[]): DayModel[] {
  const monday = week.find((d) => d.day === 1);
  if (monday === undefined) return [...week];
  return week.map((d) => (d.day >= 2 && d.day <= 5 ? { ...d, hours: monday.hours } : d));
}

export type DayProblem = "same_time" | "missing_time" | null;

export function dayProblem(hours: DayHours): DayProblem {
  if (hours.kind !== "open") return null;
  if (hours.opens === "" || hours.closes === "") return "missing_time";
  return hours.opens === hours.closes ? "same_time" : null;
}

/** Closing before opening means after midnight, shown as "2:00 next day". */
export function closesNextDay(hours: DayHours): boolean {
  return hours.kind === "open" && hours.closes !== "" && hours.closes < hours.opens;
}

/** A time input never yields 24:00; midnight at the end of the day is entered as 00:00. */
export const DEFAULT_OPEN: DayHours = {
  kind: "open",
  opens: "08:00",
  closes: "22:00",
  lastEntry: null,
};
```

`apps/web/src/lib/estimates.ts`:

```ts
import {
  DAY_TYPE,
  type DayType,
  type EstimateCell,
  FULLNESS,
  type Fullness,
  type SurveyEstimate,
  TIME_BLOCK,
  type TimeBlock,
} from "@study-spot/core";

export type CellKey = `${DayType}|${TimeBlock}`;
export type Grid = Readonly<Record<CellKey, Fullness | null>>;

export const cellKey = (day: DayType, block: TimeBlock): CellKey => `${day}|${block}`;

export function emptyGrid(): Record<CellKey, Fullness | null> {
  return {
    "weekday|morning": null,
    "weekday|afternoon": null,
    "weekday|evening": null,
    "weekday|night": null,
    "weekend|morning": null,
    "weekend|afternoon": null,
    "weekend|evening": null,
    "weekend|night": null,
  };
}

export function toGrid(estimates: readonly SurveyEstimate[]): Grid {
  const grid = emptyGrid();
  for (const e of estimates) grid[cellKey(e.day_type, e.block)] = e.bucket;
  return grid;
}

/** Each tap moves one bucket up and wraps from full to empty; an unset cell starts at empty. */
export function nextBucket(current: Fullness | null): Fullness {
  if (current === null) return "empty";
  const i = FULLNESS.indexOf(current);
  return FULLNESS[(i + 1) % FULLNESS.length] ?? "empty";
}

/** Only cells the surveyor has set; the server keeps the latest estimate per cell. */
export function cellsOf(grid: Grid): EstimateCell[] {
  return DAY_TYPE.flatMap((day_type) =>
    TIME_BLOCK.flatMap((block) => {
      const bucket = grid[cellKey(day_type, block)];
      return bucket === null ? [] : [{ day_type, block, bucket }];
    }),
  );
}
```

`apps/web/src/lib/photo.ts`:

```ts
import { PHOTO_MAX_BYTES } from "@study-spot/core";

export const MAX_SIDE = 1600;
export const QUALITY = 0.8;
export const RETRY_QUALITY = 0.7;

/** The size that fits within `max` on its longest side, never enlarging. */
export function fitWithin(width: number, height: number, max = MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export type Shrunk =
  | { ok: true; bytes: Uint8Array; width: number; height: number }
  | { ok: false; reason: "unreadable" | "too_big" };

/** The browser pieces the pipeline uses, so the size logic is testable without a canvas. */
export type ImageKit = {
  decode(file: Blob): Promise<{ width: number; height: number; image: CanvasImageSource } | null>;
  encode(
    image: CanvasImageSource,
    size: { width: number; height: number },
    quality: number,
  ): Promise<Blob | null>;
};

export const browserImageKit: ImageKit = {
  async decode(file) {
    try {
      // from-image applies the EXIF rotation before the pixels are redrawn.
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { width: bitmap.width, height: bitmap.height, image: bitmap };
    } catch {
      return null;
    }
  },
  encode(image, size, quality) {
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return Promise.resolve(null);
    ctx.drawImage(image, 0, 0, size.width, size.height);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  },
};

/**
 * On-device resize (spec section 7): decode, redraw at most 1600 px on the
 * longest side, encode JPEG at 0.8. Redrawing drops EXIF, GPS included. Over
 * 1.5 MB, one retry at 0.7; still over, refuse.
 */
export async function shrinkPhoto(file: Blob, kit: ImageKit = browserImageKit): Promise<Shrunk> {
  const decoded = await kit.decode(file);
  if (decoded === null) return { ok: false, reason: "unreadable" };
  const size = fitWithin(decoded.width, decoded.height);
  for (const quality of [QUALITY, RETRY_QUALITY]) {
    const blob = await kit.encode(decoded.image, size, quality);
    if (blob === null) return { ok: false, reason: "unreadable" };
    if (blob.size <= PHOTO_MAX_BYTES) {
      return { ok: true, bytes: new Uint8Array(await blob.arrayBuffer()), ...size };
    }
  }
  return { ok: false, reason: "too_big" };
}
```

`apps/web/src/lib/location.ts`:

```ts
import type { LatLngFix } from "@study-spot/ui-logic";

/** Worse than this, the building's own point is the better guess (journey edge 10). */
export const GOOD_FIX_METERS = 50;

export type LocationState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "denied" }
  | { kind: "fix"; fix: LatLngFix };

/** The spot's point: a good fix, else the building's. */
export function spotPoint(
  location: LocationState,
  building: { lat: number; lng: number },
): { lat: number; lng: number } {
  if (location.kind === "fix" && location.fix.accuracyMeters <= GOOD_FIX_METERS) {
    return { lat: location.fix.lat, lng: location.fix.lng };
  }
  return { lat: building.lat, lng: building.lng };
}
```

`apps/web/src/lib/fields.ts`:

```ts
import {
  AMENITY,
  type Amenity,
  type CallsOk,
  type CellSignal,
  type Eligibility,
  type EntryMethod,
  type FoodPolicy,
  type Fullness,
  type Lighting,
  type NoisePolicy,
  type SeatType,
  type TableConfig,
  type Temperature,
} from "@study-spot/core";
import { COPY, type PlainCopyId, t } from "@study-spot/ui-logic";
import type { Option } from "../ui/Segmented.tsx";

// Object.keys widens to string[]; the keys of a Record<V, ...> are V.
const opts = <V extends string>(ids: Record<V, PlainCopyId>): Option<V>[] =>
  (Object.keys(ids) as V[]).map((value) => ({ value, label: COPY[ids[value]] }));

export const ELIGIBILITY_COPY: Record<Eligibility, PlainCopyId> = {
  all_students: "access.eligibility.all_students",
  residents_building: "access.eligibility.residents_building",
  residents_quad: "access.eligibility.residents_quad",
  grad_only: "access.eligibility.grad_only",
  department: "access.eligibility.department",
  public: "access.eligibility.public",
};
export const ENTRY_COPY: Record<EntryMethod, PlainCopyId> = {
  open: "access.entry.open",
  card_swipe: "access.entry.card_swipe",
  staffed_desk: "access.entry.staffed_desk",
};
export const SEAT_TYPE_COPY: Record<SeatType, PlainCopyId> = {
  table_chair: "seating.type.table_chair",
  carrel: "seating.type.carrel",
  soft: "seating.type.soft",
  booth: "seating.type.booth",
  standing: "seating.type.standing",
};
export const TABLE_COPY: Record<TableConfig, PlainCopyId> = {
  large_shared: "seating.table.large_shared",
  small_2_4: "seating.table.small_2_4",
  individual: "seating.table.individual",
};
export const CELL_COPY: Record<CellSignal, PlainCopyId> = {
  poor: "power.cell.poor",
  ok: "power.cell.ok",
  good: "power.cell.good",
};
export const NOISE_COPY: Record<NoisePolicy, PlainCopyId> = {
  silent: "env.noise.silent",
  quiet: "env.noise.quiet",
  conversational: "env.noise.conversational",
  group_friendly: "env.noise.group_friendly",
};
export const LIGHTING_COPY: Record<Lighting, PlainCopyId> = {
  dim: "env.lighting.dim",
  moderate: "env.lighting.moderate",
  bright: "env.lighting.bright",
};
export const TEMPERATURE_COPY: Record<Temperature, PlainCopyId> = {
  cold: "env.temperature.cold",
  neutral: "env.temperature.neutral",
  warm: "env.temperature.warm",
};
export const FOOD_COPY: Record<FoodPolicy, PlainCopyId> = {
  none: "use.food.none",
  covered_drinks: "use.food.covered_drinks",
  food_ok: "use.food.food_ok",
};
export const CALLS_COPY: Record<CallsOk, PlainCopyId> = {
  not_allowed: "use.calls.not_allowed",
  allowed_impractical: "use.calls.allowed_impractical",
  allowed: "use.calls.allowed",
};
export const AMENITY_COPY: Record<Amenity, PlainCopyId> = {
  bathroom: "amenity.bathroom",
  water: "amenity.water",
  coffee_food: "amenity.coffee_food",
  printer: "amenity.printer",
  microwave: "amenity.microwave",
  late_food: "amenity.late_food",
};
export const BUCKET_COPY: Record<Fullness, PlainCopyId> = {
  empty: "estimates.bucket.empty",
  some: "estimates.bucket.some",
  filling: "estimates.bucket.filling",
  nearly_full: "estimates.bucket.nearly_full",
  full: "estimates.bucket.full",
};

export const ELIGIBILITY_OPTIONS = opts(ELIGIBILITY_COPY);
export const ENTRY_OPTIONS = opts(ENTRY_COPY);
export const CELL_OPTIONS = opts(CELL_COPY);
export const NOISE_OPTIONS = opts(NOISE_COPY);
export const LIGHTING_OPTIONS = opts(LIGHTING_COPY);
export const TEMPERATURE_OPTIONS = opts(TEMPERATURE_COPY);
export const FOOD_OPTIONS = opts(FOOD_COPY);
export const CALLS_OPTIONS = opts(CALLS_COPY);
export { AMENITY };

/** The label of every field a section editor shows, for the conflict view's rows. */
export const FIELD_LABEL: Readonly<Record<string, PlainCopyId>> = {
  official_name: "new.official_name.label",
  common_name: "new.common_name.label",
  building_id: "new.building.label",
  floor: "new.floor.label",
  directions: "new.directions.label",
  outdoor: "identity.outdoor.label",
  seasonal: "identity.seasonal.label",
  eligibility: "access.eligibility.label",
  eligibility_scope: "access.scope.label.building",
  eligibility_verified: "access.verified.label",
  entry_method: "access.entry.label",
  reservable: "access.reservable.label",
  reservation_url: "access.reservation_url.label",
  rows: "section.hours.name",
  seat_count: "seating.seat_count.label",
  seat_types: "seating.types.label",
  table_configs: "seating.tables.label",
  max_group_size: "seating.max_group.label",
  spread_out_room: "seating.spread_out.label",
  outlet_coverage_pct: "power.outlets.label",
  usb_outlets: "power.usb.label",
  wifi_mbps: "power.wifi.label",
  cell_signal: "power.cell.label",
  noise_policy: "env.noise.label",
  natural_light: "env.light.natural",
  lighting: "env.lighting.label",
  temperature: "env.temperature.label",
  temperature_consistent: "env.temperature_consistent.label",
  windows_view: "env.windows.label",
  food_policy: "use.food.label",
  group_work_ok: "use.group.label",
  calls_ok: "use.calls.label",
  whiteboard: "use.whiteboard.label",
  amenities: "section.amenities.name",
  step_free: "a11y.step_free",
  elevator: "a11y.elevator",
  accessible_seating: "a11y.seating",
  open_past_midnight: "late.past_midnight",
  staffed_late: "late.staffed",
  lit_route_to_residences: "late.lit_route",
  cells: "section.estimates.name",
};

export function fieldName(field: string): string {
  const id = FIELD_LABEL[field];
  return id === undefined ? field : COPY[id];
}

const ENUM_COPY: Readonly<Record<string, PlainCopyId>> = {
  ...ELIGIBILITY_COPY,
  ...ENTRY_COPY,
  ...SEAT_TYPE_COPY,
  ...TABLE_COPY,
  ...CELL_COPY,
  ...NOISE_COPY,
  ...LIGHTING_COPY,
  ...TEMPERATURE_COPY,
  ...FOOD_COPY,
  ...CALLS_COPY,
  ...AMENITY_COPY,
  ...BUCKET_COPY,
};

const DAY_COPY: readonly PlainCopyId[] = [
  "hours.day.sun",
  "hours.day.mon",
  "hours.day.tue",
  "hours.day.wed",
  "hours.day.thu",
  "hours.day.fri",
  "hours.day.sat",
];

function item(value: unknown): string {
  if (typeof value !== "object" || value === null) return valueText(value);
  // A non-null object, checked just above; its fields are read as unknown.
  const v = value as Record<string, unknown>;
  if (typeof v.type === "string") return valueText(v.type);
  if (typeof v.amenity === "string" && typeof v.walk_minutes === "number") {
    return `${valueText(v.amenity)} ${t("amenity.minutes", { minutes: v.walk_minutes })}`;
  }
  if (typeof v.day_of_week === "number" && typeof v.opens === "string") {
    const day = COPY[DAY_COPY[v.day_of_week] ?? "hours.day.mon"];
    return `${day} ${v.opens}-${String(v.closes)}`;
  }
  if (typeof v.day_type === "string" && typeof v.block === "string") {
    return valueText(v.bucket);
  }
  return JSON.stringify(value);
}

/** A field's value as the surveyor would read it: option labels, Yes or No, Not sure for empty. */
export function valueText(value: unknown): string {
  if (value === null || value === undefined || value === "") return t("common.unknown");
  if (typeof value === "boolean") return value ? t("common.yes") : t("common.no");
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const id = ENUM_COPY[value];
    return id === undefined ? value : COPY[id];
  }
  if (Array.isArray(value))
    return value.length === 0 ? t("common.unknown") : value.map(item).join(", ");
  return item(value);
}

/** valueText with the units a field needs (outlet coverage is stored 0 to 1, shown as a percent). */
export function fieldValueText(field: string, value: unknown): string {
  if (field === "outlet_coverage_pct" && typeof value === "number") {
    return t("power.outlets.value", { percent: Math.round(value * 100) });
  }
  return valueText(value);
}
```

- [ ] **Step 3: Write the hooks**

`apps/web/src/hooks/useSpotView.ts`:

```ts
import {
  buildSpotView,
  isLocalId,
  type PublishReadiness,
  publishReadiness,
  reviewAction,
  type SectionStatus,
  type SpotView,
  sectionStatuses,
} from "@study-spot/ui-logic";
import { useIsRestoring } from "@tanstack/react-query";
import { useDeps } from "../app/AppProvider.tsx";
import { useOutboxSnapshot } from "./useOutbox.ts";
import { useCampusTz, useServerSpot, useSpotList } from "./useQueries.ts";
import { useSession } from "./useSession.ts";

export type SpotViewState =
  /** A draft made offline was created on the server; the screen moves to the real id. */
  | { kind: "redirect"; to: string }
  | { kind: "loading" }
  /** Not on this phone and not reachable (never opened, offline). */
  | { kind: "missing" }
  | {
      kind: "ready";
      view: SpotView;
      statuses: SectionStatus[];
      readiness: PublishReadiness;
      review: "button" | "own" | "none";
      tz: string;
    };

export function useSpotView(id: string): SpotViewState {
  const { clock } = useDeps();
  const { me } = useSession();
  const snapshot = useOutboxSnapshot();
  const server = useServerSpot(id);
  const list = useSpotList();
  const tz = useCampusTz();
  // While the persisted cache is being read back, "not on this phone" would be a false alarm.
  const restoring = useIsRestoring();
  const real = snapshot.idMap[id];
  if (real !== undefined) return { kind: "redirect", to: real };
  const term = server.data?.term ?? list.data?.term ?? null;
  const view = buildSpotView(server.data ?? null, snapshot.records, id, term);
  if (view === null) {
    if (restoring || (!isLocalId(id) && server.isPending && server.fetchStatus === "fetching")) {
      return { kind: "loading" };
    }
    return { kind: "missing" };
  }
  // A local draft has never been seen by the server, so nobody else could review it yet.
  const review = me === null || view.localOnly ? "none" : reviewAction(view, me);
  return {
    kind: "ready",
    view,
    statuses: sectionStatuses(view, { now: clock.now(), tz }),
    readiness: publishReadiness(view),
    review,
    tz,
  };
}
```

`apps/web/src/hooks/useSectionForm.ts`:

```ts
import {
  type AttributeGroup,
  missingV0Fields,
  type SectionWrite,
  type SurveySection,
  type V0Field,
  v0InputOf,
} from "@study-spot/core";
import {
  initForm,
  type SectionDraft,
  type SectionForm,
  type SpotView,
  setField,
  submitForm,
} from "@study-spot/ui-logic";
import { useState } from "react";
import { useDeps } from "../app/AppProvider.tsx";

export type SaveOutcome =
  | { kind: "invalid" }
  /** Saving would take a published spot off the student app; ask first. */
  | { kind: "confirm"; fields: V0Field[] }
  | { kind: "saved"; clientWriteId: string };

/**
 * Required fields a section write would empty on a published spot. The server
 * accepts it and the spot silently drops out of the bundle (plan A ledger), so
 * the editor warns before saving.
 */
export function fieldsCleared(view: SpotView, write: SectionWrite): V0Field[] {
  if (view.spot.status !== "published") return [];
  if (write.section === "hours" || write.section === "estimates") return [];
  const after = missingV0Fields(v0InputOf({ ...view.spot, ...write.data }));
  return after.filter((f) => !view.spot.missing.includes(f));
}

export type SectionFormApi<S extends SurveySection> = {
  form: SectionForm<S>;
  set<K extends keyof SectionDraft<S>>(field: K, value: SectionDraft<S>[K]): void;
  save(opts?: { force: boolean }): Promise<SaveOutcome>;
  /** Stamps the section as checked without changing it. Null for estimates (no stamp). */
  verify: (() => Promise<string>) | null;
};

export function useSectionForm<S extends SurveySection>(
  section: S,
  view: SpotView,
): SectionFormApi<S> {
  const { outbox } = useDeps();
  const [form, setForm] = useState(() => initForm(section, view.spot));
  const spotId = view.spot.id;
  const group: AttributeGroup | null = section === "estimates" ? null : section;
  return {
    form,
    set(field, value) {
      setForm((f) => setField(f, field, value));
    },
    async save(opts) {
      const result = submitForm(form);
      if (!result.ok) {
        setForm(result.form);
        return { kind: "invalid" };
      }
      if (opts?.force !== true) {
        const cleared = fieldsCleared(view, result.write);
        if (cleared.length > 0) return { kind: "confirm", fields: cleared };
      }
      const clientWriteId = await outbox.enqueue(
        { kind: "spot.section", spot_id: spotId, payload: result.write },
        view.serverVersion,
      );
      return { kind: "saved", clientWriteId };
    },
    verify:
      group === null
        ? null
        : () =>
            outbox.enqueue(
              { kind: "spot.verify", spot_id: spotId, payload: { groups: [group] } },
              view.serverVersion,
            ),
  };
}
```

`apps/web/src/hooks/usePhotoUrl.ts`:

```ts
import { PHOTO_CONTENT_TYPE } from "@study-spot/core";
import { photoKey } from "@study-spot/ui-logic";
import { useEffect, useState } from "react";
import { useDeps } from "../app/AppProvider.tsx";

/**
 * An object URL for a photo's bytes: from this phone's queue for a photo not
 * synced yet, or from the signed image route (unapproved photos have no public
 * URL, and an <img> cannot send the bearer token).
 */
export function usePhotoUrl(
  source: { photoId: string } | { clientWriteId: string },
): string | null {
  const { blobs, session, apiBaseUrl } = useDeps();
  const [url, setUrl] = useState<string | null>(null);
  const key = "photoId" in source ? `server:${source.photoId}` : `local:${source.clientWriteId}`;
  useEffect(() => {
    let live = true;
    let made: string | null = null;
    const load = async (): Promise<Uint8Array | null> => {
      if (key.startsWith("local:")) return blobs.get(photoKey(key.slice("local:".length)));
      const token = session.token();
      if (token === null) return null;
      const res = await fetch(
        `${apiBaseUrl}/survey/photos/${encodeURIComponent(key.slice("server:".length))}/image`,
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );
      return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    };
    load()
      .then((bytes) => {
        if (!live || bytes === null) return;
        made = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: PHOTO_CONTENT_TYPE }));
        setUrl(made);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      if (made !== null) URL.revokeObjectURL(made);
    };
  }, [key, blobs, session, apiBaseUrl]);
  return url;
}
```

- [ ] **Step 4: Run the tests**

Run: `bun run --filter '@study-spot/web' test`
Expected: PASS (9 in `lib.test.ts`, 4 in `hooks.test.tsx`).

- [ ] **Step 5: Typecheck, lint, commit**

Run: `bun run fix && bun run typecheck && bun run lint && bun run --filter '@study-spot/web' test`
Expected: all pass.

```bash
git add apps/web/src/lib apps/web/src/hooks apps/web/test/lib.test.ts apps/web/test/hooks.test.tsx
git commit -m "feat(web): add spot helpers, photo resize, and spot hooks"
```

### Task 12: Spot screens: new spot, overview, conflict and failed views, and every section editor

The rest of the spot job, as screens: `/survey/spots/new` (identity only, saved on the phone at once), `/survey/spots/$id` (the contract's first viewport: ink band with name and sync postmark, the stamp row, conflict and failed banners, the ruled sheet of sections in three groups with postmark rings, the pinned action: Publish, the blocked list linking to sections, or Looks right; Unpublish for admins online), `?write=` opening the conflict or failed sheet, and `/survey/spots/$id/$section` with an editor for each of the 12 sections. Home rows link to their spot and New spot is pinned on the list.

**Files:**
- Create: `apps/web/src/ui/Choices.tsx`
- Create: `apps/web/src/screens/BuildingPicker.tsx`, `LocationButton.tsx`, `NewSpot.tsx`, `WriteSheets.tsx`, `Overview.tsx`, `spot.css`
- Create: `apps/web/src/screens/editors/EditorShell.tsx`, `simple.tsx`, `IdentityEditor.tsx`, `HoursEditor.tsx`, `EstimatesEditor.tsx`, `PhotosEditor.tsx`, `index.tsx`
- Create: `apps/web/src/routes/survey.spots.new.tsx`, `survey.spots.$id.index.tsx`, `survey.spots.$id.$section.tsx`
- Replace: `apps/web/src/routes/survey.index.tsx`; Modify: `apps/web/src/main.tsx` (import), `apps/web/src/routeTree.gen.ts` (generated)
- Create: `apps/web/test/spot.test.tsx`

**Interfaces:**
- Produces routes: `/survey/spots/new`; `/survey/spots/$id/` with search `{ write?: string }`; `/survey/spots/$id/$section` with `section` parsed by Zod to `SurveySection | "photos"` (anything else is not found).
- Produces: `TriState`, `YesNo`, `OptionalChoice`; `BuildingPicker({ buildings, value, onChange, error? })`, `matchBuildings(buildings, query)`, `LAST_BUILDING_KEY`; `LocationButton({ state, onChange })`; `NewSpot()`; `ConflictSheet({ record, spotName, onClose })`, `FailedSheet({ record, spotName, onClose })`; `Overview({ id, write })`; `EditorShell<S>({ section, view, verifyBlocked?, validate?, children: (form) => ReactNode })`, `errorFor(errors, field, specific?)`; the editors and `EDITORS: Record<OverviewSection, (props: { view }) => ReactElement>`; `CHECKLIST_KEY`.
- Consumes: Task 11 helpers and hooks; part 1 components, `SurveyHeader`, `useToasts`, `applyServerSpot`; `outbox.createSpot`, `enqueue`, `addPhoto`, `resolveConflict`, `retry`, `discard`; `api.unpublish`, `api.approvePhoto`; `conflictDiff`, `failureView`, `fieldLabel`, `fieldList`.

- [ ] **Step 1: Write the failing tests**

`apps/web/test/spot.test.tsx`:

```tsx
import type { SurveySpot } from "@study-spot/core";
import { t } from "@study-spot/ui-logic";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { surveySpotFixture } from "../../../packages/core/test/fixtures/survey-spot.ts";
import { SEATING } from "../../../packages/ui-logic/test/builders.ts";
import { ME, renderRoute, testApp } from "./harness.tsx";

const DRAFT = surveySpotFixture({
  status: "draft",
  directions: null,
  seat_count: null,
  missing: ["directions", "seat_count"],
});
const at = (spot: SurveySpot) => `/survey/spots/${spot.id}`;

test("a new spot is created on the phone and opens its overview, then moves to its real id", async () => {
  const app = testApp();
  app.network.set(false);
  const view = renderRoute(app, "/survey/spots/new");
  fireEvent.change(await screen.findByRole("searchbox", { name: t("new.building.label") }), {
    target: { value: "melv" },
  });
  fireEvent.click(await screen.findByRole("button", { name: "Melville Library" }));
  fireEvent.change(screen.getByRole("textbox", { name: t("new.floor.label") }), {
    target: { value: "3" },
  });
  expect(screen.getByRole("button", { name: t("new.save") })).toHaveProperty("disabled", true);
  fireEvent.change(screen.getByRole("textbox", { name: t("new.official_name.label") }), {
    target: { value: "Quiet Corner" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("new.save") }));
  await waitFor(() =>
    expect(view.router.state.location.pathname).toMatch(/^\/survey\/spots\/local(:|%3A)/),
  );
  expect(await screen.findByRole("heading", { name: "Quiet Corner", level: 1 })).toBeTruthy();
  expect(screen.getByText(t("spot.publish.blocked.title"))).toBeTruthy();

  app.network.set(true);
  await app.deps.outbox.idle();
  await waitFor(() => expect(view.router.state.location.pathname).not.toMatch(/local:/));
  const created = [...app.server.inner.spots.values()][0];
  expect(created?.slug).toBe("quiet-corner-melville-library");
  expect(created?.lat).toBe(40.9154);
});

test("an incomplete draft lists what is missing as links and cannot publish", async () => {
  const app = testApp({ spots: [DRAFT] });
  renderRoute(app, at(DRAFT));
  const missing = await screen.findByRole("link", {
    name: t("spot.publish.blocked.item", { field: t("field.seat_count") }),
  });
  expect(missing.getAttribute("href")).toBe(`${at(DRAFT)}/seating`);
  expect(screen.getByRole("button", { name: t("spot.publish") })).toHaveProperty("disabled", true);
  const required = screen.getByRole("region", { name: t("spot.group.required") });
  expect(within(required).getAllByText(t("spot.section.missing")).length).toBeGreaterThan(0);
});

test("a complete draft publishes through the queue and says so", async () => {
  const ready = surveySpotFixture({ status: "draft" });
  const app = testApp({ spots: [ready] });
  renderRoute(app, at(ready));
  fireEvent.click(await screen.findByRole("button", { name: t("spot.publish") }));
  expect(await screen.findByRole("button", { name: t("spot.publish.done") })).toBeTruthy();
  expect(app.server.inner.spot(ready.id).status).toBe("published");
});

test("the last editor sees why someone else reviews; a teammate gets Looks right", async () => {
  const published = surveySpotFixture({ status: "published", last_edited_by: ME.id });
  renderRoute(testApp({ spots: [published] }), at(published));
  expect(await screen.findByText(t("spot.review.own"))).toBeTruthy();
  expect(screen.queryByRole("button", { name: t("spot.review") })).toBeNull();

  const other = surveySpotFixture({
    status: "published",
    last_edited_by: "2c1e5b7a-0c2d-4f5e-9a1b-3c4d5e6f7a8b",
  });
  const app = testApp({ spots: [other] });
  renderRoute(app, at(other));
  fireEvent.click(await screen.findByRole("button", { name: t("spot.review") }));
  expect(await screen.findByText(t("spot.review.done"))).toBeTruthy();
  expect(app.server.inner.spot(other.id).review_state).toBe("reviewed");
});

test("saving a section queues it, toasts, and returns to the overview", async () => {
  const app = testApp({ spots: [DRAFT] });
  const view = renderRoute(app, `${at(DRAFT)}/seating`);
  const seats = await screen.findByRole("textbox", { name: t("seating.seat_count.label") });
  fireEvent.change(seats, { target: { value: "40" } });
  fireEvent.click(screen.getByRole("button", { name: t("editor.save") }));
  await waitFor(() => expect(view.router.state.location.pathname).toBe(at(DRAFT)));
  expect(await screen.findByText(t("editor.saved"))).toBeTruthy();
  expect(app.server.inner.spot(DRAFT.id).seat_count).toBe(40);
});

test("an empty required field shows its message and nothing is queued", async () => {
  const app = testApp({ spots: [DRAFT] });
  renderRoute(app, `${at(DRAFT)}/seating`);
  fireEvent.click(await screen.findByRole("button", { name: t("editor.save") }));
  expect(await screen.findByText(t("editor.invalid"))).toBeTruthy();
  expect(screen.getByText(t("seating.seat_count.invalid"))).toBeTruthy();
  expect(app.deps.outbox.getSnapshot().records).toEqual([]);
});

test("leaving an edited section asks first", async () => {
  const app = testApp({ spots: [DRAFT] });
  const view = renderRoute(app, `${at(DRAFT)}/seating`);
  fireEvent.change(await screen.findByRole("textbox", { name: t("seating.seat_count.label") }), {
    target: { value: "12" },
  });
  fireEvent.click(screen.getByRole("link", { name: t("common.back") }));
  fireEvent.click(await screen.findByRole("button", { name: t("editor.discard_changes.keep") }));
  expect(view.router.state.location.pathname).toBe(`${at(DRAFT)}/seating`);
  fireEvent.click(screen.getByRole("link", { name: t("common.back") }));
  fireEvent.click(await screen.findByRole("button", { name: t("editor.discard_changes.action") }));
  await waitFor(() => expect(view.router.state.location.pathname).toBe(at(DRAFT)));
});

test("clearing directions on a published spot warns before saving", async () => {
  const published = surveySpotFixture({ status: "published" });
  const app = testApp({ spots: [published] });
  renderRoute(app, `${at(published)}/identity`);
  fireEvent.change(await screen.findByRole("textbox", { name: t("new.directions.label") }), {
    target: { value: "" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("editor.save") }));
  const warning = await screen.findByRole("dialog", { name: t("editor.unpublish.title") });
  fireEvent.click(within(warning).getByRole("button", { name: t("editor.unpublish.action") }));
  await waitFor(() => expect(app.server.inner.spot(published.id).directions).toBeNull());
});

test("hours with nothing for this term cannot be marked checked", async () => {
  const noHours = surveySpotFixture({ hours: [] });
  renderRoute(testApp({ spots: [noHours] }), `${at(noHours)}/hours`);
  expect(
    await screen.findByText(t("editor.verify.hours_missing", { term: "Fall 2026" })),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: t("editor.verify") })).toBeNull();
});

test("a conflict resolves both ways from the overview", async () => {
  const spot = surveySpotFixture({ version: 3 });
  const app = testApp({ spots: [spot] });
  await app.deps.started;
  app.server.inner.bump(spot.id, { seat_count: 99, last_edited_by_name: "Jordan" });
  await app.deps.outbox.enqueue({ kind: "spot.section", spot_id: spot.id, payload: SEATING }, 3);
  await app.deps.outbox.idle();
  renderRoute(app, at(spot));
  fireEvent.click(await screen.findByRole("button", { name: t("common.open") }));
  const sheet = await screen.findByRole("dialog", {
    name: t("conflict.title", { section: t("section.seating.name") }),
  });
  expect(within(sheet).getByText(t("conflict.body", { name: "Jordan" }))).toBeTruthy();
  expect(
    within(sheet).getByRole("rowheader", { name: t("seating.seat_count.label") }),
  ).toBeTruthy();
  fireEvent.click(within(sheet).getByRole("button", { name: t("conflict.keep_mine") }));
  expect(await screen.findByText(t("conflict.resolved"))).toBeTruthy();
  await waitFor(() => expect(app.server.inner.spot(spot.id).version).toBe(5));

  app.server.inner.bump(spot.id, { seat_count: 7 });
  await app.deps.outbox.enqueue({ kind: "spot.section", spot_id: spot.id, payload: SEATING }, 5);
  await app.deps.outbox.idle();
  fireEvent.click(await screen.findByRole("button", { name: t("common.open") }));
  fireEvent.click(await screen.findByRole("button", { name: t("conflict.keep_theirs") }));
  expect(await screen.findByText(t("conflict.dropped"))).toBeTruthy();
  expect(app.server.inner.spot(spot.id).seat_count).toBe(7);
  expect(app.deps.outbox.getSnapshot().records).toEqual([]);
});

test("a failed write says why in deck words; an unreadable answer offers only Discard", async () => {
  const spot = surveySpotFixture({ version: 3 });
  const app = testApp({ spots: [spot] });
  await app.deps.started;
  app.server.inner.failWith.push(200);
  await app.deps.outbox.enqueue({ kind: "spot.section", spot_id: spot.id, payload: SEATING }, 3);
  await app.deps.outbox.idle();
  renderRoute(app, at(spot));
  expect(await screen.findByText(t("spot.failed.banner"))).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t("common.open") }));
  const sheet = await screen.findByRole("dialog", { name: t("failed.title") });
  expect(within(sheet).getByText(t("failed.reason.bad_response"))).toBeTruthy();
  expect(within(sheet).queryByRole("button", { name: t("failed.retry") })).toBeNull();
  fireEvent.click(within(sheet).getByRole("button", { name: t("failed.discard") }));
  const confirm = await screen.findByRole("dialog", { name: t("failed.discard") });
  fireEvent.click(within(confirm).getByRole("button", { name: t("failed.discard") }));
  await waitFor(() => expect(app.deps.outbox.getSnapshot().records).toEqual([]));
});

test("estimates cycle on tap and save only the cells set", async () => {
  const empty = surveySpotFixture({ estimates: [] });
  const app = testApp({ spots: [empty] });
  renderRoute(app, `${at(empty)}/estimates`);
  const cell = await screen.findByRole("button", {
    name: t("estimates.cell", {
      day: t("estimates.weekday"),
      block: t("estimates.evening"),
      bucket: t("estimates.bucket.unset"),
    }),
  });
  fireEvent.click(cell);
  fireEvent.click(cell);
  expect(cell.textContent).toBe(t("estimates.bucket.some"));
  fireEvent.click(screen.getByRole("button", { name: t("editor.save") }));
  await waitFor(() =>
    expect(app.server.inner.requests.some((r) => r.path.endsWith("/estimates"))).toBe(true),
  );
  const sent = app.server.inner.requests.find((r) => r.path.endsWith("/estimates"));
  expect(sent?.body.data).toEqual({
    cells: [{ day_type: "weekday", block: "evening", bucket: "some" }],
  });
});

test("an admin unpublishes a published spot after confirming, online only", async () => {
  const published = surveySpotFixture({ status: "published" });
  const app = testApp({ spots: [published], me: { ...ME, role: "admin" } });
  renderRoute(app, at(published));
  fireEvent.click(await screen.findByRole("button", { name: t("spot.unpublish") }));
  const confirm = await screen.findByRole("dialog", {
    name: t("spot.unpublish.confirm.title", { name: published.official_name }),
  });
  fireEvent.click(
    within(confirm).getByRole("button", { name: t("spot.unpublish.confirm.action") }),
  );
  await waitFor(() => expect(app.server.inner.spot(published.id).status).toBe("draft"));
  expect(await screen.findByText(t("spot.status.draft"))).toBeTruthy();
});
```

Run: `bun run --filter '@study-spot/web' test`
Expected: FAIL; the spot routes do not exist, so every test finds neither headings nor fields.

- [ ] **Step 2: Write the spot stylesheet and the choice controls**

`apps/web/src/screens/spot.css`:

```css
/*
 * Spot screens of survey mode: new spot, overview, section editors, the
 * conflict view, hours, the busyness grid, and photos. Tokens only.
 */

/* An entered value printed on the line, in ballpoint blue */
.entered {
  color: var(--color-accent);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.picker__option {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: var(--size-line);
  padding: var(--space-xs) 0;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.picker__option[aria-pressed="true"] {
  color: var(--color-accent);
  font-weight: 600;
}

.pinned__note {
  color: var(--color-textMuted);
  font-size: var(--fontSize-small);
}

/* Conflict view: yours and on the server, field by field */
.diff {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.diff th,
.diff td {
  padding: var(--space-xs) var(--space-xxs);
  border-bottom: var(--size-rule) solid var(--color-border);
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
  font-size: var(--fontSize-small);
}

.diff tbody th {
  font-weight: 600;
}

.diff__mine {
  color: var(--color-accent);
  font-weight: 600;
}

.blockers {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xxs) var(--space-sm);
  font-size: var(--fontSize-small);
}

.blockers a {
  display: inline-flex;
  align-items: center;
  min-height: var(--size-tapTarget);
  color: var(--color-danger);
  font-weight: 600;
}

.admin-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding-top: var(--space-md);
}

.spot-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Hours: one block per day */
.day__times {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-xs);
}

.day__time {
  display: flex;
  flex-direction: column;
  gap: var(--space-xxs);
  flex: 1 1 8rem;
}

.day__next {
  align-self: center;
  color: var(--color-accent);
  font-size: var(--fontSize-small);
  font-weight: 600;
}

.day__toggles {
  display: flex;
  flex-wrap: wrap;
  column-gap: var(--space-lg);
}

.day__toggles .check {
  border-bottom: 0;
}

.checks .check:last-child {
  border-bottom: 0;
}

/* Busyness grid: a fill line rises with the bucket */
.grid {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.grid thead th,
.grid tbody th {
  padding: var(--space-xs) var(--space-xxs);
  text-align: left;
}

.grid td {
  padding: var(--space-xxs);
}

.cell {
  position: relative;
  display: flex;
  align-items: flex-end;
  width: 100%;
  min-height: 56px;
  padding: var(--space-xs);
  border: var(--size-rule) solid var(--color-borderStrong);
  border-radius: var(--radius-control);
  background: linear-gradient(
    to top,
    color-mix(in srgb, var(--color-accent) 22%, transparent) calc(var(--fill) * 100%),
    var(--color-background) 0
  );
  color: var(--color-accent);
  font-weight: 700;
  text-align: left;
  cursor: pointer;
  transition: background var(--duration-fast) var(--easing-standard);
}

/* Fill heights follow FULLNESS_RATIO in packages/core. */
.cell[data-bucket="unset"] {
  --fill: 0;
}

.cell[data-bucket="empty"] {
  --fill: 0.1;
}

.cell[data-bucket="some"] {
  --fill: 0.35;
}

.cell[data-bucket="filling"] {
  --fill: 0.6;
}

.cell[data-bucket="nearly_full"] {
  --fill: 0.85;
}

.cell[data-bucket="full"] {
  --fill: 1;
}

.cell--unset {
  border-style: dashed;
  color: var(--color-textMuted);
  font-weight: 500;
}

.cell__text {
  position: relative;
  font-size: var(--fontSize-small);
  line-height: var(--lineHeight-tight);
}

/* Photos */
.photos {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.photo {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding-bottom: var(--space-md);
  border-bottom: var(--size-rule) solid var(--color-border);
}

.photo__img {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: var(--radius-card);
  background: var(--color-surface);
}

.photo__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-xs);
}

.checklist {
  margin: 0;
  padding-left: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

@media (prefers-reduced-motion: reduce) {
  .cell {
    transition: none;
  }
}
```

In `apps/web/src/main.tsx`, import it after the survey stylesheet:

```ts
import "./ui/styles.css";
import "./screens/spot.css";
```

`apps/web/src/ui/Choices.tsx`:

```tsx
import { t } from "@study-spot/ui-logic";
import { type Option, Segmented } from "./Segmented.tsx";

const UNKNOWN = "__unknown";

type TriProps = {
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  helper?: string;
};

/** Yes, No, or Not sure for an optional fact; Not sure stores nothing. */
export function TriState({ label, value, onChange, helper }: TriProps) {
  const options: Option<"yes" | "no" | typeof UNKNOWN>[] = [
    { value: "yes", label: t("common.yes") },
    { value: "no", label: t("common.no") },
    { value: UNKNOWN, label: t("common.unknown") },
  ];
  return (
    <Segmented
      label={label}
      helper={helper}
      options={options}
      value={value === null ? UNKNOWN : value ? "yes" : "no"}
      onChange={(v) => onChange(v === UNKNOWN ? null : v === "yes")}
    />
  );
}

type YesNoProps = {
  label: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
  helper?: string;
  error?: string | undefined;
};

/** A required yes or no: no third option. */
export function YesNo({ label, value, onChange, helper, error }: YesNoProps) {
  return (
    <Segmented
      label={label}
      helper={helper}
      error={error}
      options={[
        { value: "yes", label: t("common.yes") },
        { value: "no", label: t("common.no") },
      ]}
      value={value === null ? null : value ? "yes" : "no"}
      onChange={(v) => onChange(v === "yes")}
    />
  );
}

type OptionalProps<V extends string> = {
  label: string;
  options: readonly Option<V>[];
  value: V | null;
  onChange: (value: V | null) => void;
  helper?: string;
  layout?: "row" | "list";
};

/** One of a few options, plus Not sure for an optional field. */
export function OptionalChoice<V extends string>(p: OptionalProps<V>) {
  const known = (x: V | typeof UNKNOWN): x is V => x !== UNKNOWN;
  const options: Option<V | typeof UNKNOWN>[] = [
    ...p.options,
    { value: UNKNOWN, label: t("common.unknown") },
  ];
  return (
    <Segmented<V | typeof UNKNOWN>
      label={p.label}
      helper={p.helper}
      layout={p.layout ?? "row"}
      options={options}
      value={p.value ?? UNKNOWN}
      onChange={(v) => p.onChange(known(v) ? v : null)}
    />
  );
}
```

- [ ] **Step 3: Write the new-spot screen**

`apps/web/src/screens/BuildingPicker.tsx`:

```tsx
import type { CampusInfo } from "@study-spot/core";
import { t } from "@study-spot/ui-logic";
import { useId, useState } from "react";

type Building = CampusInfo["buildings"][number];

export const LAST_BUILDING_KEY = "survey:last-building";
const SHOWN = 6;

/** Matches every typed word against the name, in any order. */
export function matchBuildings(buildings: readonly Building[], query: string): Building[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return buildings.filter((b) => words.every((w) => b.name.toLowerCase().includes(w)));
}

type Props = {
  buildings: readonly Building[] | undefined;
  value: string | null;
  onChange: (building: Building) => void;
  error?: string | undefined;
};

/**
 * Search, then tap one of the first six matches. The chosen building reads in
 * ballpoint blue on the line; the last one used is preselected by the caller.
 */
export function BuildingPicker({ buildings, value, onChange, error }: Props) {
  const inputId = useId();
  const helpId = useId();
  const [query, setQuery] = useState("");
  const chosen = buildings?.find((b) => b.id === value);
  const matches = buildings === undefined ? [] : matchBuildings(buildings, query).slice(0, SHOWN);
  return (
    <div className={`field${error === undefined ? "" : " field--error"}`}>
      <label className="label field__label" htmlFor={inputId}>
        {t("new.building.label")}
      </label>
      {chosen === undefined ? null : <p className="entered">{chosen.name}</p>}
      {buildings === undefined ? (
        <p className="field__helper">{t("new.building.offline")}</p>
      ) : (
        <>
          <input
            id={inputId}
            className="input"
            type="search"
            value={query}
            placeholder={t("new.building.placeholder")}
            autoComplete="off"
            aria-describedby={error === undefined ? undefined : helpId}
            onChange={(e) => setQuery(e.currentTarget.value)}
          />
          {query.trim() === "" ? null : matches.length === 0 ? (
            <p className="field__helper">{t("new.building.none")}</p>
          ) : (
            <ul className="ruled-list picker">
              {matches.map((b) => (
                <li key={b.id} className="ruled">
                  <button
                    type="button"
                    className="picker__option"
                    aria-pressed={b.id === value}
                    onClick={() => {
                      onChange(b);
                      setQuery("");
                    }}
                  >
                    {b.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {error === undefined ? null : (
        <p className="field__error" id={helpId}>
          {error}
        </p>
      )}
    </div>
  );
}
```

`apps/web/src/screens/LocationButton.tsx`:

```tsx
import { t } from "@study-spot/ui-logic";
import { LocateFixed } from "lucide-react";
import { useDeps } from "../app/AppProvider.tsx";
import { GOOD_FIX_METERS, type LocationState } from "../lib/location.ts";
import { Button } from "../ui/Button.tsx";

/** Optional: fills the spot's point from the phone. The building alone is always enough. */
export function LocationButton(props: {
  state: LocationState;
  onChange: (next: LocationState) => void;
}) {
  const { geolocation } = useDeps();
  const { state } = props;
  async function locate() {
    props.onChange({ kind: "pending" });
    const fix = await geolocation.current();
    props.onChange(fix === null ? { kind: "denied" } : { kind: "fix", fix });
  }
  const meters = state.kind === "fix" ? Math.round(state.fix.accuracyMeters) : 0;
  return (
    <div className="field">
      <Button
        icon={<LocateFixed aria-hidden="true" size={20} strokeWidth={2.25} />}
        disabled={state.kind === "pending"}
        onClick={() => void locate()}
      >
        {state.kind === "pending" ? t("new.location.pending") : t("new.location.button")}
      </Button>
      <p className="field__helper" aria-live="polite">
        {state.kind === "denied"
          ? t("new.location.denied")
          : state.kind === "fix"
            ? meters <= GOOD_FIX_METERS
              ? t("new.location.done", { meters })
              : t("new.location.poor", { meters })
            : ""}
      </p>
    </div>
  );
}
```

`apps/web/src/screens/NewSpot.tsx`:

```tsx
import type { IdentitySection } from "@study-spot/core";
import { t } from "@study-spot/ui-logic";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useDeps } from "../app/AppProvider.tsx";
import { useCampus } from "../hooks/useQueries.ts";
import { type LocationState, spotPoint } from "../lib/location.ts";
import { spotSlug } from "../lib/slug.ts";
import { Button } from "../ui/Button.tsx";
import { TextField } from "../ui/Field.tsx";
import { Screen } from "../ui/Screen.tsx";
import { BuildingPicker, LAST_BUILDING_KEY } from "./BuildingPicker.tsx";
import { LocationButton } from "./LocationButton.tsx";
import { SurveyHeader } from "./SurveyHeader.tsx";

function lastBuilding(): string | null {
  try {
    return localStorage.getItem(LAST_BUILDING_KEY);
  } catch {
    return null;
  }
}

function rememberBuilding(id: string): void {
  try {
    localStorage.setItem(LAST_BUILDING_KEY, id);
  } catch {
    // Remembering is a convenience; the picker still works without it.
  }
}

/** Identity only: the minimum to make a draft, saved on the phone at once (journey B2). */
export function NewSpot() {
  const { outbox } = useDeps();
  const campus = useCampus();
  const navigate = useNavigate();
  const buildings = campus.data?.buildings;
  const [buildingId, setBuildingId] = useState<string | null>(lastBuilding);
  const [floor, setFloor] = useState("");
  const [name, setName] = useState("");
  const [commonName, setCommonName] = useState("");
  const [directions, setDirections] = useState("");
  const [location, setLocation] = useState<LocationState>({ kind: "idle" });
  const [saving, setSaving] = useState(false);
  const building = buildings?.find((b) => b.id === buildingId);
  const ready = building !== undefined && floor.trim() !== "" && name.trim() !== "";

  async function create() {
    if (building === undefined || !ready) return;
    setSaving(true);
    const identity: IdentitySection = {
      slug: spotSlug(name.trim(), building.id),
      official_name: name.trim(),
      common_name: commonName.trim() === "" ? null : commonName.trim(),
      building_id: building.id,
      floor: floor.trim(),
      ...spotPoint(location, building),
      directions: directions.trim() === "" ? null : directions.trim(),
      outdoor: false,
      seasonal: false,
    };
    rememberBuilding(building.id);
    const id = await outbox.createSpot(identity);
    await navigate({ to: "/survey/spots/$id", params: { id }, replace: true });
  }

  return (
    <>
      <SurveyHeader title={t("new.title")} back={{ to: "/survey" }} />
      <Screen
        action={
          <>
            {ready ? null : <p className="pinned__note">{t("new.blocked")}</p>}
            <Button
              variant="primary"
              wide
              disabled={!ready || saving}
              onClick={() => void create()}
            >
              {t("new.save")}
            </Button>
          </>
        }
      >
        <BuildingPicker
          buildings={buildings}
          value={buildingId}
          onChange={(b) => setBuildingId(b.id)}
        />
        <TextField
          label={t("new.floor.label")}
          helper={t("new.floor.helper")}
          value={floor}
          onChange={setFloor}
          maxLength={20}
        />
        <TextField
          label={t("new.official_name.label")}
          helper={t("new.official_name.helper")}
          value={name}
          onChange={setName}
          maxLength={200}
        />
        <TextField
          label={t("new.common_name.label")}
          optional={t("common.optional")}
          value={commonName}
          onChange={setCommonName}
          maxLength={200}
        />
        <LocationButton state={location} onChange={setLocation} />
        <TextField
          label={t("new.directions.label")}
          helper={t("new.directions.helper")}
          placeholder={t("new.directions.placeholder")}
          value={directions}
          onChange={setDirections}
          multiline
          maxLength={2000}
        />
      </Screen>
    </>
  );
}
```

- [ ] **Step 4: Write the overview and its sheets**

`apps/web/src/screens/WriteSheets.tsx`:

```tsx
import { conflictDiff, failureView, t, type WriteRecord } from "@study-spot/ui-logic";
import { useState } from "react";
import { useDeps } from "../app/AppProvider.tsx";
import { useToasts } from "../hooks/useToasts.tsx";
import { fieldName, fieldValueText } from "../lib/fields.ts";
import { sectionName, whatOf } from "../lib/format.ts";
import { Button } from "../ui/Button.tsx";
import { ConfirmSheet, Sheet } from "../ui/Sheet.tsx";

function subject(record: WriteRecord, spotName: string): string {
  if (record.kind === "spot.section") return sectionName(record.payload.section);
  if (record.kind === "spot.verify" && record.payload.groups[0] !== undefined) {
    return sectionName(record.payload.groups[0]);
  }
  return spotName;
}

/**
 * Two versions of one section, field by field (journey edge 4). Keep mine sends
 * the edit again on top of the server's version; Keep theirs drops it. Nothing
 * is overwritten silently either way.
 */
export function ConflictSheet(props: {
  record: WriteRecord;
  spotName: string;
  onClose: () => void;
}) {
  const { outbox } = useDeps();
  const toasts = useToasts();
  const { record } = props;
  const rows = conflictDiff(record);
  const editor = record.current?.last_edited_by_name ?? null;
  async function choose(choice: "mine" | "theirs") {
    await outbox.resolveConflict(record.client_write_id, choice);
    toasts.show(choice === "mine" ? t("conflict.resolved") : t("conflict.dropped"));
    props.onClose();
  }
  return (
    <Sheet
      open
      title={t("conflict.title", { section: subject(record, props.spotName) })}
      onClose={props.onClose}
      actions={
        <>
          <Button variant="primary" wide onClick={() => void choose("mine")}>
            {t("conflict.keep_mine")}
          </Button>
          <Button wide onClick={() => void choose("theirs")}>
            {t("conflict.keep_theirs")}
          </Button>
        </>
      }
    >
      <p>{editor === null ? t("conflict.body_unknown") : t("conflict.body", { name: editor })}</p>
      {rows.length === 0 ? null : (
        <table className="diff">
          <thead>
            <tr>
              <td />
              <th scope="col" className="label">
                {t("conflict.yours")}
              </th>
              <th scope="col" className="label">
                {t("conflict.theirs")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.field}>
                <th scope="row">{fieldName(row.field)}</th>
                <td className="diff__mine">{fieldValueText(row.field, row.yours)}</td>
                <td>{fieldValueText(row.field, row.theirs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Sheet>
  );
}

/** A change the server refused: why, in the deck's words, and Retry or Discard. */
export function FailedSheet(props: { record: WriteRecord; spotName: string; onClose: () => void }) {
  const { outbox } = useDeps();
  const { record } = props;
  const [confirming, setConfirming] = useState(false);
  const view = failureView(record.error);
  return (
    <>
      <Sheet
        open={!confirming}
        title={t("failed.title")}
        onClose={props.onClose}
        actions={
          <>
            {view.canRetry ? (
              <Button
                variant="primary"
                wide
                onClick={() => {
                  void outbox.retry(record.client_write_id);
                  props.onClose();
                }}
              >
                {t("failed.retry")}
              </Button>
            ) : null}
            <Button
              variant={view.canRetry ? "secondary" : "danger"}
              wide
              onClick={() => setConfirming(true)}
            >
              {t("failed.discard")}
            </Button>
          </>
        }
      >
        <p className="label">{whatOf(record, props.spotName)}</p>
        <p>{view.message}</p>
      </Sheet>
      <ConfirmSheet
        open={confirming}
        title={t("failed.discard")}
        body={t("failed.discard.confirm")}
        action={t("failed.discard")}
        cancel={t("common.cancel")}
        destructive
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          void outbox.discard(record.client_write_id);
          props.onClose();
        }}
      />
    </>
  );
}
```

`apps/web/src/screens/Overview.tsx`:

```tsx
import type { SurveySpot } from "@study-spot/core";
import {
  fieldLabel,
  plural,
  type SectionStatus,
  type SpotView,
  t,
  type WriteRecord,
} from "@study-spot/ui-logic";
import { Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { useDeps } from "../app/AppProvider.tsx";
import { applyServerSpot } from "../app/serverCache.ts";
import { useOnline } from "../hooks/useOnline.ts";
import { useSession } from "../hooks/useSession.ts";
import { type SpotViewState, useSpotView } from "../hooks/useSpotView.ts";
import { useToasts } from "../hooks/useToasts.tsx";
import { postmarkState, sectionName, shortDate } from "../lib/format.ts";
import { Banner } from "../ui/Banner.tsx";
import { Button } from "../ui/Button.tsx";
import { Postmark } from "../ui/Postmark.tsx";
import { RuledRow } from "../ui/RuledRow.tsx";
import { GroupHeading, Screen } from "../ui/Screen.tsx";
import { ConfirmSheet } from "../ui/Sheet.tsx";
import { StampChip } from "../ui/StampChip.tsx";
import { SurveyHeader } from "./SurveyHeader.tsx";
import { ConflictSheet, FailedSheet } from "./WriteSheets.tsx";

/** What a section row says: trouble and sync first, then how filled and when checked. */
function rowValue(
  s: SectionStatus,
  tz: string,
): { text: string; tone: "value" | "missing" | "muted" } {
  switch (s.sync) {
    case "conflict":
      return { text: t("spot.section.conflict"), tone: "missing" };
    case "failed":
      return { text: t("spot.section.failed"), tone: "missing" };
    case "syncing":
      return { text: t("spot.section.syncing"), tone: "muted" };
    case "saved_on_phone":
      return { text: t("spot.section.on_phone"), tone: "muted" };
    case "synced":
      break;
  }
  if (s.fill === "missing") return { text: t("spot.section.missing"), tone: "missing" };
  if (s.fill === "partial") return { text: t("spot.section.partial"), tone: "value" };
  if (s.checkedToday) return { text: t("spot.section.verified_today"), tone: "value" };
  if (s.verifiedAt !== null) {
    return {
      text: t("spot.section.verified", { date: shortDate(s.verifiedAt, tz) }),
      tone: "value",
    };
  }
  return { text: t("spot.section.done"), tone: "value" };
}

function postmarkFor(s: SectionStatus, tz: string, now: Date): ReactNode {
  if (s.section === "photos" || s.section === "estimates") return null;
  const state = postmarkState(s.verifiedAt, now);
  const date = s.verifiedAt === null ? "" : shortDate(s.verifiedAt, tz).toUpperCase();
  const label =
    s.verifiedAt === null
      ? t("home.stale.never")
      : s.checkedToday
        ? t("spot.section.verified_today")
        : t("spot.section.verified", { date: shortDate(s.verifiedAt, tz) });
  return <Postmark state={state} date={date} label={label} />;
}

const GROUPS = [
  { group: "required", title: "spot.group.required" },
  { group: "extras", title: "spot.group.extras" },
  { group: "optional", title: "spot.group.optional" },
] as const;

function Stamps({ spot, view }: { spot: SurveySpot; view: SpotView }) {
  return (
    <div className="stamp-row">
      {spot.status === "published" ? (
        <StampChip tone="green" filled>
          {t("spot.status.published")}
        </StampChip>
      ) : (
        <StampChip tone="ink">{t("spot.status.draft")}</StampChip>
      )}
      {view.publishQueued ? (
        <StampChip tone="blue">{t("spot.publish.queued_chip")}</StampChip>
      ) : null}
      {spot.review_state === "reviewed" && spot.reviewed_by_name !== null ? (
        <StampChip tone="green">
          {t("spot.status.reviewed", { name: spot.reviewed_by_name })}
        </StampChip>
      ) : view.reviewQueued ? (
        <StampChip tone="blue">{t("spot.review.queued")}</StampChip>
      ) : view.localOnly ? null : (
        <StampChip tone="amber">{t("spot.status.unreviewed")}</StampChip>
      )}
    </div>
  );
}

/** One ruled sheet per spot: what is filled in, what is missing, what is checked (contract). */
export function Overview(props: { id: string; write: string | undefined }) {
  const state = useSpotView(props.id);
  const navigate = useNavigate();
  useEffect(() => {
    if (state.kind === "redirect") {
      void navigate({ to: "/survey/spots/$id", params: { id: state.to }, replace: true });
    }
  }, [state, navigate]);
  if (state.kind !== "ready") {
    return (
      <>
        <SurveyHeader title={t("app.name")} back={{ to: "/survey" }} />
        <Screen>
          <p className="lede">
            {state.kind === "missing" ? t("spot.not_found") : t("common.loading")}
          </p>
        </Screen>
      </>
    );
  }
  return <Ready id={props.id} write={props.write} state={state} />;
}

function Ready(props: {
  id: string;
  write: string | undefined;
  state: Extract<SpotViewState, { kind: "ready" }>;
}) {
  const { outbox, clock, api, queryClient } = useDeps();
  const { me } = useSession();
  const online = useOnline();
  const toasts = useToasts();
  const navigate = useNavigate();
  const [unpublishing, setUnpublishing] = useState(false);
  const { view, statuses, readiness, review, tz } = props.state;
  const { spot } = view;
  const now = clock.now();
  const conflicts = view.records.filter((r) => r.state === "conflict");
  const failed = view.records.filter((r) => r.state === "failed");
  const open = view.records.find((r) => r.client_write_id === props.write);
  const show = (r: WriteRecord | undefined) =>
    void navigate({
      to: "/survey/spots/$id",
      params: { id: props.id },
      search: r === undefined ? {} : { write: r.client_write_id },
    });

  async function publish() {
    const id = await outbox.enqueue(
      { kind: "spot.publish", spot_id: spot.id, payload: {} },
      view.serverVersion,
    );
    toasts.track(id, { done: "spot.publish.done", waiting: "spot.publish.queued" });
  }
  async function markReviewed() {
    const id = await outbox.enqueue(
      { kind: "spot.review", spot_id: spot.id, payload: {} },
      view.serverVersion,
    );
    toasts.track(id, { done: "spot.review.done", waiting: "spot.review.queued" });
  }
  async function unpublish() {
    setUnpublishing(false);
    const res = await api.unpublish(spot.id, { client_write_id: crypto.randomUUID() });
    if (res.kind === "ok") applyServerSpot(queryClient, res.value);
    else toasts.show(t("error.generic"));
  }

  const reviewButton =
    review === "button" ? (
      <Button
        variant={readiness.kind === "ready" ? "secondary" : "primary"}
        wide
        onClick={() => void markReviewed()}
      >
        {t("spot.review")}
      </Button>
    ) : null;
  let action: ReactNode = reviewButton;
  if (readiness.kind === "ready") {
    action = (
      <>
        <Button variant="primary" wide onClick={() => void publish()}>
          {t("spot.publish")}
        </Button>
        {reviewButton}
      </>
    );
  } else if (readiness.kind === "blocked") {
    action = (
      <>
        <p className="label">{t("spot.publish.blocked.title")}</p>
        <ul className="blockers">
          {readiness.missing.map(({ field, section }) => {
            const text = t("spot.publish.blocked.item", { field: fieldLabel(field) });
            return (
              <li key={field}>
                {section === null ? (
                  text
                ) : (
                  <Link to="/survey/spots/$id/$section" params={{ id: spot.id, section }}>
                    {text}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
        <Button variant="primary" wide disabled>
          {t("spot.publish")}
        </Button>
      </>
    );
  }

  return (
    <>
      <SurveyHeader title={spot.official_name} back={{ to: "/survey" }} />
      <Screen action={action}>
        <Stamps spot={spot} view={view} />
        {conflicts.length > 0 ? (
          <Banner
            action={
              <Button variant="quiet" onClick={() => show(conflicts[0])}>
                {t("common.open")}
              </Button>
            }
          >
            {t("spot.conflict.banner")}
          </Banner>
        ) : null}
        {failed.length > 0 ? (
          <Banner
            action={
              <Button variant="quiet" onClick={() => show(failed[0])}>
                {t("common.open")}
              </Button>
            }
          >
            {plural(failed.length, "spot.failed.banner", "spot.failed.banner_many")}
          </Banner>
        ) : null}
        {review === "own" ? <p className="lede">{t("spot.review.own")}</p> : null}
        {GROUPS.map(({ group, title }) => (
          <section key={group} aria-labelledby={`group-${group}`}>
            <GroupHeading id={`group-${group}`}>{t(title)}</GroupHeading>
            <ul className="ruled-list">
              {statuses
                .filter((s) => s.group === group)
                .map((s) => {
                  const value = rowValue(s, tz);
                  return (
                    <RuledRow
                      key={s.section}
                      label={sectionName(s.section)}
                      value={value.text}
                      tone={value.tone}
                      trailing={postmarkFor(s, tz, now)}
                      link={{
                        to: "/survey/spots/$id/$section",
                        params: { id: spot.id, section: s.section },
                      }}
                    />
                  );
                })}
            </ul>
          </section>
        ))}
        {me?.role === "admin" && spot.status === "published" && !view.localOnly ? (
          <section className="admin-actions">
            <Button variant="danger" disabled={!online} onClick={() => setUnpublishing(true)}>
              {t("spot.unpublish")}
            </Button>
            {online ? null : <p className="field__helper">{t("error.network_admin")}</p>}
          </section>
        ) : null}
      </Screen>
      {open?.state === "conflict" ? (
        <ConflictSheet
          record={open}
          spotName={spot.official_name}
          onClose={() => show(undefined)}
        />
      ) : null}
      {open?.state === "failed" ? (
        <FailedSheet record={open} spotName={spot.official_name} onClose={() => show(undefined)} />
      ) : null}
      <ConfirmSheet
        open={unpublishing}
        title={t("spot.unpublish.confirm.title", { name: spot.official_name })}
        body={t("spot.unpublish.confirm.body")}
        action={t("spot.unpublish.confirm.action")}
        cancel={t("common.cancel")}
        destructive
        onCancel={() => setUnpublishing(false)}
        onConfirm={() => void unpublish()}
      />
    </>
  );
}
```

- [ ] **Step 5: Write the editor shell and the field editors**

`apps/web/src/screens/editors/EditorShell.tsx`:

```tsx
import type { SurveySection, V0Field } from "@study-spot/core";
import { fieldList, type SpotView, t } from "@study-spot/ui-logic";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useRef, useState } from "react";
import { type SectionFormApi, useSectionForm } from "../../hooks/useSectionForm.ts";
import { useToasts } from "../../hooks/useToasts.tsx";
import { sectionName } from "../../lib/format.ts";
import { Banner } from "../../ui/Banner.tsx";
import { Button } from "../../ui/Button.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { ConfirmSheet } from "../../ui/Sheet.tsx";
import { SurveyHeader } from "../SurveyHeader.tsx";

/** Field error text: the deck's specific message where there is one, else "Required". */
export function errorFor(
  errors: Readonly<Record<string, string>>,
  field: string,
  specific?: string,
): string | undefined {
  if (errors[field] === undefined) return undefined;
  return specific ?? t("common.required");
}

type Props<S extends SurveySection> = {
  section: S;
  view: SpotView;
  /** Why "Checked, nothing changed" cannot be used yet, if it cannot. */
  verifyBlocked?: string | undefined;
  /** Checks the schema cannot express (hours that open and close at once). False blocks Save. */
  validate?: () => boolean;
  children: (form: SectionFormApi<S>) => ReactNode;
};

/**
 * One section on one screen (journey B5): the fields, then Save pinned at the
 * bottom with "Checked, nothing changed" beside it. Leaving with edits asks
 * first; saving a change that would take a published spot off the student app
 * asks first too.
 */
export function EditorShell<S extends SurveySection>({
  section,
  view,
  verifyBlocked,
  validate,
  children,
}: Props<S>) {
  const api = useSectionForm(section, view);
  const toasts = useToasts();
  const navigate = useNavigate();
  const [invalid, setInvalid] = useState(false);
  const [cleared, setCleared] = useState<V0Field[] | null>(null);
  // A ref, not state: the blocker is asked during the navigation that saving starts.
  const leaving = useRef(false);
  const blocker = useBlocker({
    shouldBlockFn: () => api.form.dirty && !leaving.current,
    withResolver: true,
  });
  const back = () => navigate({ to: "/survey/spots/$id", params: { id: view.spot.id } });

  async function save(force: boolean) {
    setCleared(null);
    if (validate !== undefined && !validate()) return setInvalid(true);
    const outcome = await api.save({ force });
    if (outcome.kind === "invalid") return setInvalid(true);
    if (outcome.kind === "confirm") return setCleared(outcome.fields);
    toasts.track(outcome.clientWriteId, { done: "editor.saved", waiting: "editor.saved_offline" });
    leaving.current = true;
    await back();
  }
  async function verify() {
    if (api.verify === null) return;
    const id = await api.verify();
    toasts.track(id, { done: "editor.verify.done", waiting: "editor.saved_offline" });
    leaving.current = true;
    await back();
  }

  return (
    <>
      <SurveyHeader
        title={sectionName(section)}
        back={{ to: "/survey/spots/$id", params: { id: view.spot.id } }}
      />
      <Screen
        action={
          <>
            <Button variant="primary" wide onClick={() => void save(false)}>
              {t("editor.save")}
            </Button>
            {api.verify === null ? null : verifyBlocked === undefined ? (
              <Button wide disabled={api.form.dirty} onClick={() => void verify()}>
                {t("editor.verify")}
              </Button>
            ) : (
              <p className="pinned__note">{verifyBlocked}</p>
            )}
          </>
        }
      >
        <p className="lede spot-name">{view.spot.official_name}</p>
        {invalid ? <Banner>{t("editor.invalid")}</Banner> : null}
        {children(api)}
      </Screen>
      <ConfirmSheet
        open={cleared !== null}
        title={t("editor.unpublish.title")}
        body={t("editor.unpublish.body", { fields: fieldList(cleared ?? []) })}
        action={t("editor.unpublish.action")}
        cancel={t("editor.discard_changes.keep")}
        destructive
        onCancel={() => setCleared(null)}
        onConfirm={() => void save(true)}
      />
      <ConfirmSheet
        open={blocker.status === "blocked"}
        title={t("editor.discard_changes.title")}
        body={t("editor.discard_changes.body", { section: sectionName(section) })}
        action={t("editor.discard_changes.action")}
        cancel={t("editor.discard_changes.keep")}
        destructive
        onCancel={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
      />
    </>
  );
}
```

`apps/web/src/screens/editors/simple.tsx` (Access, Seating, Power and signal, Noise and feel, House rules, Nearby, Accessibility, Late night):

```tsx
import {
  AMENITY,
  type Amenity,
  type Eligibility,
  SEAT_TYPE,
  type SeatType,
  TABLE_CONFIG,
  type TableConfig,
} from "@study-spot/core";
import { COPY, type SpotView, t } from "@study-spot/ui-logic";
import {
  AMENITY_COPY,
  CALLS_OPTIONS,
  CELL_OPTIONS,
  ELIGIBILITY_OPTIONS,
  ENTRY_OPTIONS,
  FOOD_OPTIONS,
  LIGHTING_OPTIONS,
  NOISE_OPTIONS,
  SEAT_TYPE_COPY,
  TABLE_COPY,
  TEMPERATURE_OPTIONS,
} from "../../lib/fields.ts";
import { Check } from "../../ui/Check.tsx";
import { OptionalChoice, TriState, YesNo } from "../../ui/Choices.tsx";
import { TextField } from "../../ui/Field.tsx";
import { Segmented } from "../../ui/Segmented.tsx";
import { Stepper } from "../../ui/Stepper.tsx";
import { EditorShell, errorFor } from "./EditorShell.tsx";

type EditorProps = { view: SpotView };

/** Eligibility limited to one building, quad, or department asks which one. */
function scopeLabel(e: Eligibility | null): string | null {
  switch (e) {
    case "residents_building":
      return t("access.scope.label.building");
    case "residents_quad":
      return t("access.scope.label.quad");
    case "department":
      return t("access.scope.label.department");
    default:
      return null;
  }
}

export function AccessEditor({ view }: EditorProps) {
  return (
    <EditorShell section="access" view={view}>
      {({ form, set }) => {
        const v = form.values;
        const scope = scopeLabel(v.eligibility);
        return (
          <>
            <Segmented
              label={t("access.eligibility.label")}
              helper={t("access.eligibility.helper")}
              error={errorFor(form.errors, "eligibility")}
              layout="list"
              options={ELIGIBILITY_OPTIONS}
              value={v.eligibility}
              onChange={(x) => set("eligibility", x)}
            />
            {scope === null ? null : (
              <TextField
                label={scope}
                value={v.eligibility_scope ?? ""}
                onChange={(x) => set("eligibility_scope", x.trim() === "" ? null : x)}
                maxLength={200}
              />
            )}
            <Check
              label={t("access.verified.label")}
              helper={t("access.verified.helper")}
              checked={v.eligibility_verified === true}
              onChange={(x) => set("eligibility_verified", x)}
            />
            <OptionalChoice
              label={t("access.entry.label")}
              options={ENTRY_OPTIONS}
              value={v.entry_method}
              onChange={(x) => set("entry_method", x)}
            />
            <Check
              label={t("access.reservable.label")}
              checked={v.reservable === true}
              onChange={(x) => set("reservable", x)}
            />
            {v.reservable === true ? (
              <TextField
                label={t("access.reservation_url.label")}
                inputMode="url"
                value={v.reservation_url ?? ""}
                error={errorFor(
                  form.errors,
                  "reservation_url",
                  t("access.reservation_url.invalid"),
                )}
                onChange={(x) => set("reservation_url", x.trim() === "" ? null : x.trim())}
                maxLength={500}
              />
            ) : null}
          </>
        );
      }}
    </EditorShell>
  );
}

function toggle<T>(list: readonly T[], item: T, on: boolean): T[] {
  return on ? [...list.filter((x) => x !== item), item] : list.filter((x) => x !== item);
}

export function SeatingEditor({ view }: EditorProps) {
  return (
    <EditorShell section="seating" view={view}>
      {({ form, set }) => {
        const v = form.values;
        const types = v.seat_types ?? [];
        const tables = v.table_configs ?? [];
        return (
          <>
            <Stepper
              label={t("seating.seat_count.label")}
              helper={t("seating.seat_count.helper")}
              error={errorFor(form.errors, "seat_count", t("seating.seat_count.invalid"))}
              value={v.seat_count}
              min={1}
              onChange={(x) => set("seat_count", x)}
            />
            <fieldset className="field checks">
              <legend className="label field__label">{t("seating.types.label")}</legend>
              {SEAT_TYPE.map((type: SeatType) => (
                <Check
                  key={type}
                  label={COPY[SEAT_TYPE_COPY[type]]}
                  checked={types.some((s) => s.type === type)}
                  onChange={(on) =>
                    set(
                      "seat_types",
                      on
                        ? [...types.filter((s) => s.type !== type), { type, count: 0 }]
                        : types.filter((s) => s.type !== type),
                    )
                  }
                />
              ))}
            </fieldset>
            <fieldset className="field checks">
              <legend className="label field__label">{t("seating.tables.label")}</legend>
              {TABLE_CONFIG.map((c: TableConfig) => (
                <Check
                  key={c}
                  label={COPY[TABLE_COPY[c]]}
                  checked={tables.includes(c)}
                  onChange={(on) => set("table_configs", toggle(tables, c, on))}
                />
              ))}
            </fieldset>
            <Stepper
              label={t("seating.max_group.label")}
              value={v.max_group_size}
              min={1}
              max={200}
              onChange={(x) => set("max_group_size", x)}
            />
            <TriState
              label={t("seating.spread_out.label")}
              value={v.spread_out_room}
              onChange={(x) => set("spread_out_room", x)}
            />
          </>
        );
      }}
    </EditorShell>
  );
}

export function PowerEditor({ view }: EditorProps) {
  return (
    <EditorShell section="power" view={view}>
      {({ form, set }) => {
        const v = form.values;
        return (
          <>
            <Stepper
              label={t("power.outlets.label")}
              helper={t("power.outlets.helper")}
              error={errorFor(form.errors, "outlet_coverage_pct")}
              value={
                v.outlet_coverage_pct === null ? null : Math.round(v.outlet_coverage_pct * 100)
              }
              min={0}
              max={100}
              step={10}
              suffix={t("unit.percent")}
              onChange={(x) => set("outlet_coverage_pct", x === null ? null : x / 100)}
            />
            <TriState
              label={t("power.usb.label")}
              value={v.usb_outlets}
              onChange={(x) => set("usb_outlets", x)}
            />
            <TextField
              label={t("power.wifi.label")}
              helper={t("power.wifi.helper")}
              inputMode="decimal"
              value={v.wifi_mbps === null ? "" : String(v.wifi_mbps)}
              onChange={(x) => {
                const n = Number(x.replace(",", "."));
                set("wifi_mbps", x.trim() === "" || !Number.isFinite(n) || n < 0 ? null : n);
              }}
              maxLength={8}
            />
            <OptionalChoice
              label={t("power.cell.label")}
              options={CELL_OPTIONS}
              value={v.cell_signal}
              onChange={(x) => set("cell_signal", x)}
            />
          </>
        );
      }}
    </EditorShell>
  );
}

export function EnvironmentEditor({ view }: EditorProps) {
  return (
    <EditorShell section="environment" view={view}>
      {({ form, set }) => {
        const v = form.values;
        return (
          <>
            <Segmented
              label={t("env.noise.label")}
              helper={t("env.noise.helper")}
              error={errorFor(form.errors, "noise_policy")}
              layout="list"
              options={NOISE_OPTIONS}
              value={v.noise_policy}
              onChange={(x) => set("noise_policy", x)}
            />
            <TriState
              label={t("env.light.natural")}
              value={v.natural_light}
              onChange={(x) => set("natural_light", x)}
            />
            <OptionalChoice
              label={t("env.lighting.label")}
              options={LIGHTING_OPTIONS}
              value={v.lighting}
              onChange={(x) => set("lighting", x)}
            />
            <OptionalChoice
              label={t("env.temperature.label")}
              options={TEMPERATURE_OPTIONS}
              value={v.temperature}
              onChange={(x) => set("temperature", x)}
            />
            <TriState
              label={t("env.temperature_consistent.label")}
              value={v.temperature_consistent}
              onChange={(x) => set("temperature_consistent", x)}
            />
            <TriState
              label={t("env.windows.label")}
              value={v.windows_view}
              onChange={(x) => set("windows_view", x)}
            />
          </>
        );
      }}
    </EditorShell>
  );
}

export function UseFitEditor({ view }: EditorProps) {
  return (
    <EditorShell section="use_fit" view={view}>
      {({ form, set }) => {
        const v = form.values;
        return (
          <>
            <Segmented
              label={t("use.food.label")}
              error={errorFor(form.errors, "food_policy")}
              options={FOOD_OPTIONS}
              value={v.food_policy}
              onChange={(x) => set("food_policy", x)}
            />
            <YesNo
              label={t("use.group.label")}
              helper={t("use.group.helper")}
              error={errorFor(form.errors, "group_work_ok")}
              value={v.group_work_ok}
              onChange={(x) => set("group_work_ok", x)}
            />
            <OptionalChoice
              label={t("use.calls.label")}
              layout="list"
              options={CALLS_OPTIONS}
              value={v.calls_ok}
              onChange={(x) => set("calls_ok", x)}
            />
            <TriState
              label={t("use.whiteboard.label")}
              value={v.whiteboard}
              onChange={(x) => set("whiteboard", x)}
            />
          </>
        );
      }}
    </EditorShell>
  );
}

export function AmenitiesEditor({ view }: EditorProps) {
  return (
    <EditorShell section="amenities" view={view}>
      {({ form, set }) => {
        const list = form.values.amenities ?? [];
        const minutes = (a: Amenity) => list.find((x) => x.amenity === a)?.walk_minutes ?? null;
        return (
          <>
            <p className="lede">{t("amenity.helper")}</p>
            {AMENITY.map((a: Amenity) => (
              <Stepper
                key={a}
                label={COPY[AMENITY_COPY[a]]}
                value={minutes(a)}
                min={0}
                max={60}
                suffix={t("unit.minutes")}
                onChange={(x) =>
                  set(
                    "amenities",
                    x === null
                      ? list.filter((y) => y.amenity !== a)
                      : [...list.filter((y) => y.amenity !== a), { amenity: a, walk_minutes: x }],
                  )
                }
              />
            ))}
          </>
        );
      }}
    </EditorShell>
  );
}

export function AccessibilityEditor({ view }: EditorProps) {
  return (
    <EditorShell section="accessibility" view={view}>
      {({ form, set }) => (
        <>
          <TriState
            label={t("a11y.step_free")}
            value={form.values.step_free}
            onChange={(x) => set("step_free", x)}
          />
          <TriState
            label={t("a11y.elevator")}
            value={form.values.elevator}
            onChange={(x) => set("elevator", x)}
          />
          <TriState
            label={t("a11y.seating")}
            value={form.values.accessible_seating}
            onChange={(x) => set("accessible_seating", x)}
          />
        </>
      )}
    </EditorShell>
  );
}

export function LateNightEditor({ view }: EditorProps) {
  return (
    <EditorShell section="late_night" view={view}>
      {({ form, set }) => (
        <>
          <TriState
            label={t("late.past_midnight")}
            value={form.values.open_past_midnight}
            onChange={(x) => set("open_past_midnight", x)}
          />
          <TriState
            label={t("late.staffed")}
            value={form.values.staffed_late}
            onChange={(x) => set("staffed_late", x)}
          />
          <TriState
            label={t("late.lit_route")}
            value={form.values.lit_route_to_residences}
            onChange={(x) => set("lit_route_to_residences", x)}
          />
        </>
      )}
    </EditorShell>
  );
}
```

`apps/web/src/screens/editors/IdentityEditor.tsx`:

```tsx
import { isLocalId, type SpotView, t } from "@study-spot/ui-logic";
import { useState } from "react";
import { useCampus } from "../../hooks/useQueries.ts";
import { type LocationState, spotPoint } from "../../lib/location.ts";
import { spotSlug } from "../../lib/slug.ts";
import { Check } from "../../ui/Check.tsx";
import { TextField } from "../../ui/Field.tsx";
import { BuildingPicker } from "../BuildingPicker.tsx";
import { LocationButton } from "../LocationButton.tsx";
import { EditorShell, errorFor } from "./EditorShell.tsx";

/**
 * Basics. A draft still only on this phone takes a new slug from its name (a
 * refused create is fixed here, e.g. slug_taken); a spot on the server keeps
 * its slug so student links stay put.
 */
export function IdentityEditor({ view }: { view: SpotView }) {
  const campus = useCampus();
  const [location, setLocation] = useState<LocationState>({ kind: "idle" });
  const local = isLocalId(view.spot.id);
  return (
    <EditorShell section="identity" view={view}>
      {({ form, set }) => {
        const v = form.values;
        const rename = (name: string) => {
          set("official_name", name);
          if (local && v.building_id !== null) set("slug", spotSlug(name.trim(), v.building_id));
        };
        return (
          <>
            <TextField
              label={t("new.official_name.label")}
              helper={t("new.official_name.helper")}
              error={errorFor(form.errors, "official_name")}
              value={v.official_name ?? ""}
              onChange={rename}
              maxLength={200}
            />
            <TextField
              label={t("new.common_name.label")}
              optional={t("common.optional")}
              value={v.common_name ?? ""}
              onChange={(x) => set("common_name", x.trim() === "" ? null : x)}
              maxLength={200}
            />
            <BuildingPicker
              buildings={campus.data?.buildings}
              value={v.building_id}
              error={errorFor(form.errors, "building_id")}
              onChange={(b) => {
                set("building_id", b.id);
                const point = spotPoint(location, b);
                set("lat", point.lat);
                set("lng", point.lng);
                if (local && v.official_name !== null)
                  set("slug", spotSlug(v.official_name.trim(), b.id));
              }}
            />
            <TextField
              label={t("new.floor.label")}
              helper={t("new.floor.helper")}
              error={errorFor(form.errors, "floor")}
              value={v.floor ?? ""}
              onChange={(x) => set("floor", x)}
              maxLength={20}
            />
            <LocationButton
              state={location}
              onChange={(next) => {
                setLocation(next);
                if (next.kind === "fix") {
                  const point = spotPoint(next, {
                    lat: v.lat ?? next.fix.lat,
                    lng: v.lng ?? next.fix.lng,
                  });
                  set("lat", point.lat);
                  set("lng", point.lng);
                }
              }}
            />
            <TextField
              label={t("new.directions.label")}
              helper={t("new.directions.helper")}
              placeholder={t("new.directions.placeholder")}
              value={v.directions ?? ""}
              onChange={(x) => set("directions", x.trim() === "" ? null : x)}
              multiline
              maxLength={2000}
            />
            <Check
              label={t("identity.outdoor.label")}
              checked={v.outdoor === true}
              onChange={(x) => set("outdoor", x)}
            />
            <Check
              label={t("identity.seasonal.label")}
              checked={v.seasonal === true}
              onChange={(x) => set("seasonal", x)}
            />
          </>
        );
      }}
    </EditorShell>
  );
}
```

- [ ] **Step 6: Write the hours, busyness, and photo editors**

`apps/web/src/screens/editors/HoursEditor.tsx`:

```tsx
import type { HoursRow } from "@study-spot/core";
import { type PlainCopyId, type SpotView, t } from "@study-spot/ui-logic";
import { useState } from "react";
import {
  closesNextDay,
  copyMonday,
  type DayHours,
  type DayModel,
  DEFAULT_OPEN,
  dayProblem,
  fromWeek,
  toWeek,
} from "../../lib/hours.ts";
import { Button } from "../../ui/Button.tsx";
import { Check } from "../../ui/Check.tsx";
import { GroupHeading } from "../../ui/Screen.tsx";
import { EditorShell } from "./EditorShell.tsx";

const DAY_NAME: Record<DayModel["day"], PlainCopyId> = {
  1: "hours.day.mon",
  2: "hours.day.tue",
  3: "hours.day.wed",
  4: "hours.day.thu",
  5: "hours.day.fri",
  6: "hours.day.sat",
  0: "hours.day.sun",
};

function DayRow(props: {
  model: DayModel;
  showErrors: boolean;
  onChange: (hours: DayHours) => void;
}) {
  const { hours } = props.model;
  const name = t(DAY_NAME[props.model.day]);
  const problem = props.showErrors ? dayProblem(hours) : null;
  const open = hours.kind === "open" ? hours : null;
  return (
    <fieldset className={`field day${problem === null ? "" : " field--error"}`}>
      <legend className="label field__label">{name}</legend>
      {open === null ? null : (
        <div className="day__times">
          <label className="day__time">
            <span className="label">{t("hours.opens")}</span>
            <input
              className="input"
              type="time"
              value={open.opens}
              onChange={(e) => props.onChange({ ...open, opens: e.currentTarget.value })}
            />
          </label>
          <label className="day__time">
            <span className="label">{t("hours.closes")}</span>
            <input
              className="input"
              type="time"
              value={open.closes}
              onChange={(e) => props.onChange({ ...open, closes: e.currentTarget.value })}
            />
          </label>
          {closesNextDay(hours) ? <span className="day__next">{t("hours.next_day")}</span> : null}
        </div>
      )}
      <div className="day__toggles">
        <Check
          label={t("hours.closed")}
          checked={hours.kind === "closed"}
          onChange={(on) => props.onChange(on ? { kind: "closed" } : DEFAULT_OPEN)}
        />
        <Check
          label={t("hours.all_day")}
          checked={hours.kind === "all_day"}
          onChange={(on) => props.onChange(on ? { kind: "all_day" } : DEFAULT_OPEN)}
        />
      </div>
      {problem === "same_time" ? (
        <p className="field__error">{t("hours.invalid.same_time")}</p>
      ) : null}
      {problem === "missing_time" ? <p className="field__error">{t("common.required")}</p> : null}
    </fieldset>
  );
}

function Week(props: {
  week: DayModel[];
  showErrors: boolean;
  onChange: (week: DayModel[]) => void;
}) {
  return (
    <>
      {props.week.map((d) => (
        <DayRow
          key={d.day}
          model={d}
          showErrors={props.showErrors}
          onChange={(hours) =>
            props.onChange(props.week.map((x) => (x.day === d.day ? { ...x, hours } : x)))
          }
        />
      ))}
    </>
  );
}

/**
 * The week for the current term (journey B5): copy Monday to the weekdays,
 * closed or 24 hours per day, closing after midnight reads "next day", and a
 * second week for finals.
 */
export function HoursEditor({ view }: { view: SpotView }) {
  const rows: readonly HoursRow[] = view.spot.hours;
  const [regular, setRegular] = useState(() => toWeek(rows, false));
  const [exam, setExam] = useState(() => toWeek(rows, true));
  const [withExam, setWithExam] = useState(() => rows.some((r) => r.is_exam));
  const [showErrors, setShowErrors] = useState(false);
  const term = view.spot.term;
  const verifyBlocked =
    term === null
      ? t("failed.reason.unknown_term")
      : view.spot.hours.length === 0
        ? t("editor.verify.hours_missing", { term: term.name })
        : undefined;
  const allDays = withExam ? [...regular, ...exam] : regular;
  return (
    <EditorShell
      section="hours"
      view={view}
      verifyBlocked={verifyBlocked}
      validate={() => {
        setShowErrors(true);
        return term !== null && allDays.every((d) => dayProblem(d.hours) === null);
      }}
    >
      {({ set }) => {
        const commit = (nextRegular: DayModel[], nextExam: DayModel[], examOn: boolean) => {
          setRegular(nextRegular);
          setExam(nextExam);
          setWithExam(examOn);
          set("rows", [
            ...fromWeek(nextRegular, false),
            ...(examOn ? fromWeek(nextExam, true) : []),
          ]);
        };
        return (
          <>
            {term === null ? null : <p className="title">{t("hours.term", { term: term.name })}</p>}
            <p className="lede">{t("hours.helper")}</p>
            <Button onClick={() => commit(copyMonday(regular), exam, withExam)}>
              {t("hours.copy_weekdays")}
            </Button>
            <Week
              week={regular}
              showErrors={showErrors}
              onChange={(w) => commit(w, exam, withExam)}
            />
            <Check
              label={t("hours.exam.toggle")}
              checked={withExam}
              onChange={(on) => commit(regular, exam, on)}
            />
            {withExam ? (
              <section aria-labelledby="exam-hours">
                <GroupHeading id="exam-hours">{t("hours.exam.title")}</GroupHeading>
                <Week
                  week={exam}
                  showErrors={showErrors}
                  onChange={(w) => commit(regular, w, true)}
                />
              </section>
            ) : null}
          </>
        );
      }}
    </EditorShell>
  );
}
```

`apps/web/src/screens/editors/EstimatesEditor.tsx`:

```tsx
import { DAY_TYPE, TIME_BLOCK } from "@study-spot/core";
import { COPY, type PlainCopyId, type SpotView, t } from "@study-spot/ui-logic";
import { useState } from "react";
import { cellKey, cellsOf, type Grid, nextBucket, toGrid } from "../../lib/estimates.ts";
import { BUCKET_COPY } from "../../lib/fields.ts";
import { EditorShell } from "./EditorShell.tsx";

const DAY_COPY: Record<(typeof DAY_TYPE)[number], PlainCopyId> = {
  weekday: "estimates.weekday",
  weekend: "estimates.weekend",
};
const BLOCK_COPY: Record<(typeof TIME_BLOCK)[number], PlainCopyId> = {
  morning: "estimates.morning",
  afternoon: "estimates.afternoon",
  evening: "estimates.evening",
  night: "estimates.night",
};

/**
 * Busyness guesses: time blocks down, weekdays and weekends across, so a
 * 360 px phone fits "Nearly full". Each tap moves a cell one bucket up.
 */
export function EstimatesEditor({ view }: { view: SpotView }) {
  const [grid, setGrid] = useState<Grid>(() => toGrid(view.spot.estimates));
  const untouched = view.spot.estimates.length === 0;
  return (
    <EditorShell section="estimates" view={view}>
      {({ set }) => (
        <>
          <p className="lede">{t("estimates.helper")}</p>
          {untouched ? <p className="field__helper">{t("estimates.tap_hint")}</p> : null}
          <table className="grid">
            <thead>
              <tr>
                <td />
                {DAY_TYPE.map((day) => (
                  <th key={day} scope="col" className="label">
                    {t(DAY_COPY[day])}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIME_BLOCK.map((block) => (
                <tr key={block}>
                  <th scope="row" className="label">
                    {t(BLOCK_COPY[block])}
                  </th>
                  {DAY_TYPE.map((day) => {
                    const bucket = grid[cellKey(day, block)];
                    const label =
                      bucket === null ? t("estimates.bucket.unset") : COPY[BUCKET_COPY[bucket]];
                    return (
                      <td key={day}>
                        <button
                          type="button"
                          className={`cell${bucket === null ? " cell--unset" : ""}`}
                          data-bucket={bucket ?? "unset"}
                          aria-label={t("estimates.cell", {
                            day: t(DAY_COPY[day]),
                            block: t(BLOCK_COPY[block]),
                            bucket: label,
                          })}
                          onClick={() => {
                            const next = { ...grid, [cellKey(day, block)]: nextBucket(bucket) };
                            setGrid(next);
                            set("cells", cellsOf(next));
                          }}
                        >
                          <span className="cell__text">{label}</span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </EditorShell>
  );
}
```

`apps/web/src/screens/editors/PhotosEditor.tsx`:

```tsx
import type { SurveyPhoto } from "@study-spot/core";
import { type PendingPhoto, type SpotView, t } from "@study-spot/ui-logic";
import { Camera, ImagePlus } from "lucide-react";
import { useRef, useState } from "react";
import { useDeps } from "../../app/AppProvider.tsx";
import { applyServerSpot } from "../../app/serverCache.ts";
import { useOnline } from "../../hooks/useOnline.ts";
import { usePhotoUrl } from "../../hooks/usePhotoUrl.ts";
import { useSession } from "../../hooks/useSession.ts";
import { useToasts } from "../../hooks/useToasts.tsx";
import { shrinkPhoto } from "../../lib/photo.ts";
import { Banner } from "../../ui/Banner.tsx";
import { Button } from "../../ui/Button.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { StampChip } from "../../ui/StampChip.tsx";
import { SurveyHeader } from "../SurveyHeader.tsx";

/** Shown before the first photo of a browser session (journey B6). */
export const CHECKLIST_KEY = "survey:photo-checklist-seen";

function checklistSeen(): boolean {
  try {
    return sessionStorage.getItem(CHECKLIST_KEY) === "1";
  } catch {
    return false;
  }
}

function markChecklistSeen(): void {
  try {
    sessionStorage.setItem(CHECKLIST_KEY, "1");
  } catch {
    // Without session storage the checklist shows each time; harmless.
  }
}

const CHECKLIST = [
  "photos.checklist.landscape",
  "photos.checklist.wide",
  "photos.checklist.light",
  "photos.checklist.no_people",
  "photos.checklist.no_logos",
] as const;

function ServerPhoto(props: { photo: SurveyPhoto; view: SpotView }) {
  const { photo, view } = props;
  const { outbox, api, queryClient } = useDeps();
  const { me } = useSession();
  const online = useOnline();
  const toasts = useToasts();
  const url = usePhotoUrl({ photoId: photo.id });
  const own = me !== null && me.role !== "admin" && photo.uploaded_by === me.id;
  async function approve() {
    const res = await api.approvePhoto(photo.id, { client_write_id: crypto.randomUUID() });
    if (res.kind === "ok") {
      applyServerSpot(queryClient, res.value);
      toasts.show(t("photos.approve.done"));
    } else {
      toasts.show(t("error.generic"));
    }
  }
  async function cover() {
    const id = await outbox.enqueue(
      { kind: "photo.cover", spot_id: view.spot.id, payload: { photo_id: photo.id } },
      view.serverVersion,
    );
    toasts.track(id, { done: "editor.saved", waiting: "editor.saved_offline" });
  }
  return (
    <li className="photo">
      {url === null ? (
        <div className="photo__img photo__img--empty" />
      ) : (
        <img className="photo__img" src={url} alt="" />
      )}
      <div className="stamp-row">
        {photo.is_cover ? (
          <StampChip tone="ink" filled>
            {t("photos.is_cover")}
          </StampChip>
        ) : null}
        {photo.approved ? (
          <StampChip tone="green">{t("photos.approved")}</StampChip>
        ) : (
          <StampChip tone="amber">{t("photos.awaiting")}</StampChip>
        )}
      </div>
      <div className="photo__actions">
        {photo.is_cover ? null : <Button onClick={() => void cover()}>{t("photos.cover")}</Button>}
        {photo.approved ? null : own ? (
          <p className="field__helper">{t("photos.approve.own")}</p>
        ) : (
          <Button disabled={!online} onClick={() => void approve()}>
            {t("photos.approve")}
          </Button>
        )}
      </div>
    </li>
  );
}

function LocalPhoto(props: { photo: PendingPhoto }) {
  const url = usePhotoUrl({ clientWriteId: props.photo.client_write_id });
  return (
    <li className="photo">
      {url === null ? (
        <div className="photo__img photo__img--empty" />
      ) : (
        <img className="photo__img" src={url} alt="" />
      )}
      <div className="stamp-row">
        <StampChip tone={props.photo.state === "failed" ? "red" : "blue"}>
          {props.photo.state === "failed" ? t("spot.section.failed") : t("photos.not_synced")}
        </StampChip>
      </div>
      <p className="field__helper">{t("photos.cover.wait")}</p>
    </li>
  );
}

/**
 * Photos: take or choose one, shrunk on the phone to a JPEG of at most 1600 px
 * with no EXIF, queued with the spot's other changes. Covers are set on synced
 * photos only; approving needs a connection.
 */
export function PhotosEditor({ view }: { view: SpotView }) {
  const { outbox } = useDeps();
  const online = useOnline();
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [checklist, setChecklist] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<"too_big" | "unreadable" | null>(null);

  function takePhoto() {
    if (checklistSeen()) camera.current?.click();
    else setChecklist(true);
  }

  async function onFile(file: File | undefined) {
    if (file === undefined) return;
    setBusy(true);
    setProblem(null);
    const shrunk = await shrinkPhoto(file);
    setBusy(false);
    if (!shrunk.ok) return setProblem(shrunk.reason);
    await outbox.addPhoto(view.spot.id, view.serverVersion, shrunk.bytes, new Date());
  }

  const photos = view.spot.photos;
  const pending = view.pendingPhotos;
  return (
    <>
      <SurveyHeader
        title={t("section.photos.name")}
        back={{ to: "/survey/spots/$id", params: { id: view.spot.id } }}
      />
      <Screen
        action={
          <>
            <Button
              variant="primary"
              wide
              disabled={busy}
              icon={<Camera aria-hidden="true" size={20} strokeWidth={2.25} />}
              onClick={takePhoto}
            >
              {busy ? t("photos.processing") : t("photos.take")}
            </Button>
            <Button
              wide
              disabled={busy}
              icon={<ImagePlus aria-hidden="true" size={20} strokeWidth={2.25} />}
              onClick={() => library.current?.click()}
            >
              {t("photos.choose")}
            </Button>
          </>
        }
      >
        <p className="lede spot-name">{view.spot.official_name}</p>
        {problem === null ? null : (
          <Banner>{problem === "too_big" ? t("photos.too_big") : t("photos.unreadable")}</Banner>
        )}
        {online ? null : <p className="field__helper">{t("photos.online_only")}</p>}
        {photos.length === 0 && pending.length === 0 ? (
          <p className="empty">{t("photos.empty")}</p>
        ) : null}
        <ul className="photos">
          {pending.map((p) => (
            <LocalPhoto key={p.client_write_id} photo={p} />
          ))}
          {photos.map((p) => (
            <ServerPhoto key={p.id} photo={p} view={view} />
          ))}
        </ul>
        <input
          ref={camera}
          className="visually-hidden"
          type="file"
          accept="image/*"
          capture="environment"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            void onFile(e.currentTarget.files?.[0]);
            e.currentTarget.value = "";
          }}
        />
        <input
          ref={library}
          className="visually-hidden"
          type="file"
          accept="image/*"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="photo-library"
          onChange={(e) => {
            void onFile(e.currentTarget.files?.[0]);
            e.currentTarget.value = "";
          }}
        />
      </Screen>
      <Sheet
        open={checklist}
        title={t("photos.checklist.title")}
        onClose={() => setChecklist(false)}
        actions={
          <Button
            variant="primary"
            wide
            onClick={() => {
              markChecklistSeen();
              setChecklist(false);
              // Still inside the tap, so the browser lets the camera open.
              camera.current?.click();
            }}
          >
            {t("photos.checklist.ok")}
          </Button>
        }
      >
        <ul className="checklist">
          {CHECKLIST.map((id) => (
            <li key={id}>{t(id)}</li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
```

`apps/web/src/screens/editors/index.tsx`:

```tsx
import type { OverviewSection, SpotView } from "@study-spot/ui-logic";
import type { ReactElement } from "react";
import { EstimatesEditor } from "./EstimatesEditor.tsx";
import { HoursEditor } from "./HoursEditor.tsx";
import { IdentityEditor } from "./IdentityEditor.tsx";
import { PhotosEditor } from "./PhotosEditor.tsx";
import {
  AccessEditor,
  AccessibilityEditor,
  AmenitiesEditor,
  EnvironmentEditor,
  LateNightEditor,
  PowerEditor,
  SeatingEditor,
  UseFitEditor,
} from "./simple.tsx";

/** One editor per overview row; the route renders the one its $section names. */
export const EDITORS: Readonly<
  Record<OverviewSection, (props: { view: SpotView }) => ReactElement>
> = {
  identity: IdentityEditor,
  access: AccessEditor,
  hours: HoursEditor,
  seating: SeatingEditor,
  power: PowerEditor,
  environment: EnvironmentEditor,
  use_fit: UseFitEditor,
  amenities: AmenitiesEditor,
  accessibility: AccessibilityEditor,
  late_night: LateNightEditor,
  estimates: EstimatesEditor,
  photos: PhotosEditor,
};
```

- [ ] **Step 7: Write the routes**

`apps/web/src/routes/survey.spots.new.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { NewSpot } from "../screens/NewSpot.tsx";

export const Route = createFileRoute("/survey/spots/new")({ component: NewSpot });
```

`apps/web/src/routes/survey.spots.$id.index.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Overview } from "../screens/Overview.tsx";

/** `?write=<client_write_id>` opens the conflict or failed view for that change. */
const Search = z.object({ write: z.string().optional() });

export const Route = createFileRoute("/survey/spots/$id/")({
  validateSearch: Search,
  component: OverviewRoute,
});

function OverviewRoute() {
  const { id } = Route.useParams();
  const { write } = Route.useSearch();
  // Keyed by id so a draft's move from its local id to the real one starts fresh.
  return <Overview key={id} id={id} write={write} />;
}
```

`apps/web/src/routes/survey.spots.$id.$section.tsx`:

```tsx
import { SURVEY_SECTION } from "@study-spot/core";
import { t } from "@study-spot/ui-logic";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { useSpotView } from "../hooks/useSpotView.ts";
import { EDITORS } from "../screens/editors/index.tsx";
import { SurveyHeader } from "../screens/SurveyHeader.tsx";
import { Screen } from "../ui/Screen.tsx";

const Section = z.enum([...SURVEY_SECTION, "photos"]);

export const Route = createFileRoute("/survey/spots/$id/$section")({
  params: {
    parse: (raw) => {
      const section = Section.safeParse(raw.section);
      if (!section.success) throw notFound();
      return { id: raw.id, section: section.data };
    },
    stringify: (p) => ({ id: p.id, section: p.section }),
  },
  component: SectionRoute,
});

function SectionRoute() {
  const { id, section } = Route.useParams();
  const state = useSpotView(id);
  const navigate = useNavigate();
  useEffect(() => {
    if (state.kind === "redirect") {
      void navigate({
        to: "/survey/spots/$id/$section",
        params: { id: state.to, section },
        replace: true,
      });
    }
  }, [state, section, navigate]);
  if (state.kind !== "ready") {
    return (
      <>
        <SurveyHeader title={t("app.name")} back={{ to: "/survey" }} />
        <Screen>
          <p className="lede">
            {state.kind === "missing" ? t("spot.not_found") : t("common.loading")}
          </p>
        </Screen>
      </>
    );
  }
  const Editor = EDITORS[section];
  // Keyed by spot and section: a fresh form each time an editor opens.
  return <Editor key={`${state.view.spot.id}:${section}`} view={state.view} />;
}
```

Replace `apps/web/src/routes/survey.index.tsx` (rows link to their spot, New spot is pinned):

```tsx
import { t } from "@study-spot/ui-logic";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Home } from "../screens/Home.tsx";

export const Route = createFileRoute("/survey/")({ component: HomeRoute });

function HomeRoute() {
  return (
    <Home
      spotLink={(id) => ({ to: "/survey/spots/$id", params: { id } })}
      action={
        <Link to="/survey/spots/new" className="btn btn--primary btn--wide">
          <Plus aria-hidden="true" size={20} strokeWidth={2.5} />
          <span className="btn__label">{t("home.new_spot")}</span>
        </Link>
      }
    />
  );
}
```

- [ ] **Step 8: Regenerate the route tree and run the tests**

Run: `VITE_API_BASE_URL=http://127.0.0.1:8787 VITE_DATA_BASE_URL=http://data.localhost:8788 bun run --filter '@study-spot/web' build`
Expected: builds; `routeTree.gen.ts` lists the three spot routes.

Run: `bun run --filter '@study-spot/web' test`
Expected: PASS (13 in `spot.test.tsx`; every earlier web test still passes).

- [ ] **Step 9: Typecheck, lint, commit**

Run: `bun run fix && bun run typecheck && bun run lint && bun run --filter '@study-spot/web' test`
Expected: all pass.

```bash
git add apps/web/src apps/web/test/spot.test.tsx
git commit -m "feat(web): add spot overview, new spot, and every section editor"
```

### Task 13: Acceptance end to end: offline spot with photo, conflict both ways, review rule, long names

Spec section 12 items that a browser can check, on the real server: (1) a spot made offline with every v0-required field and a photo syncs and publishes, and the stored photo is a JPEG of at most 1600 px and 1.5 MB with no EXIF; (3) a second surveyor can mark a spot reviewed and the one who edited it cannot; (4) a conflicting edit from two phones resolves both ways. Plus the 360 px long-name check. Steps that run offline navigate inside the app, as on a phone; an offline reload is part 3's test.

**Files:**
- Create: `apps/web/e2e/api.ts`, `apps/web/e2e/photo.ts`, `apps/web/e2e/spots.e2e.ts`

**Interfaces:**
- Produces (e2e): `tokenOf(page)`, `call(token, method, path, body?)`, `getSpot(token, id)`, `completeSpot(token, name, { publish }?)`, `surveyorInvite(adminToken)`; `bigJpeg(page, width?, height?): Promise<Buffer>`, `withExif(jpeg): Buffer`, `GPS_MARK`.
- Consumes: part 1 `fixtures.ts`, `API_ORIGIN`; core `SurveySpot`; `StoredSession` from `ui-logic`.

- [ ] **Step 1: Write the helpers**

`apps/web/e2e/api.ts`:

```ts
import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { SurveySpot } from "@study-spot/core";
import { StoredSession } from "@study-spot/ui-logic";
import { API_ORIGIN } from "../playwright.config.ts";

/** The bearer token this page signed in with, from the app's own storage. */
export async function tokenOf(page: Page): Promise<string> {
  const raw = await page.evaluate(() => localStorage.getItem("survey:session"));
  if (raw === null) throw new Error("page is not signed in");
  return StoredSession.parse(JSON.parse(raw)).token;
}

/** Calls the API from the test runner, as the surveyor whose token is given. */
export async function call(
  token: string,
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${API_ORIGIN}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text === "" ? null : JSON.parse(text);
}

export const getSpot = async (token: string, id: string) =>
  SurveySpot.parse(await call(token, "GET", `/survey/spots/${id}`));

/** A spot with every v0-required field, made through the API so a test starts from it. */
export async function completeSpot(
  token: string,
  name: string,
  opts: { publish: boolean } = { publish: false },
): Promise<SurveySpot> {
  const created = SurveySpot.parse(
    await call(token, "POST", "/survey/spots", {
      client_write_id: randomUUID(),
      identity: {
        slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${randomUUID().slice(0, 8)}`,
        official_name: name,
        common_name: null,
        building_id: "melville-library",
        floor: "2",
        lat: 40.9154,
        lng: -73.1222,
        directions: "Main doors, then left.",
        outdoor: false,
        seasonal: false,
      },
    }),
  );
  const sections: [string, unknown][] = [
    [
      "access",
      {
        eligibility: "all_students",
        eligibility_scope: null,
        eligibility_verified: true,
        entry_method: "open",
        reservable: false,
        reservation_system: null,
        reservation_url: null,
      },
    ],
    [
      "seating",
      {
        seat_count: 30,
        seat_types: [],
        table_configs: [],
        effective_capacity: null,
        max_group_size: null,
        spread_out_room: null,
      },
    ],
    ["power", { outlet_coverage_pct: 0.5, usb_outlets: null, wifi_mbps: null, cell_signal: null }],
    [
      "environment",
      {
        noise_policy: "quiet",
        natural_light: null,
        lighting: null,
        temperature: null,
        temperature_consistent: null,
        windows_view: null,
      },
    ],
    ["use_fit", { calls_ok: null, group_work_ok: true, whiteboard: null, food_policy: "food_ok" }],
  ];
  let spot = created;
  for (const [section, data] of sections) {
    spot = SurveySpot.parse(
      await call(token, "PUT", `/survey/spots/${spot.id}/${section}`, {
        client_write_id: randomUUID(),
        base_version: spot.version,
        data,
      }),
    );
  }
  if (opts.publish) {
    spot = SurveySpot.parse(
      await call(token, "POST", `/survey/spots/${spot.id}/publish`, {
        client_write_id: randomUUID(),
      }),
    );
  }
  return spot;
}

/** A new-surveyor invite link made by an admin, as a path to open in another context. */
export async function surveyorInvite(adminToken: string): Promise<string> {
  const res = (await call(adminToken, "POST", "/admin/invites", { role: "surveyor" })) as {
    url: string;
  };
  const url = new URL(res.url);
  return `${url.pathname}${url.search}`;
}
```

`apps/web/e2e/photo.ts`:

```ts
import type { Page } from "@playwright/test";

/** A large landscape JPEG drawn in the page (gradients and blocks, so it compresses like a photo). */
export async function bigJpeg(page: Page, width = 4000, height = 3000): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ([w, h]) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext("2d");
      if (g === null) throw new Error("no 2d context");
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#7aa7d9");
      sky.addColorStop(1, "#e9dcc4");
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i += 1) {
        g.fillStyle = `hsl(${(i * 37) % 360} 40% ${30 + (i % 5) * 10}%)`;
        g.fillRect((i * 97) % w, (i * 53) % h, w / 8, h / 10);
      }
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.95));
      if (blob === null) throw new Error("no jpeg");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = "";
      for (const b of bytes) s += String.fromCharCode(b);
      return btoa(s);
    },
    [width, height] as const,
  );
  return Buffer.from(base64, "base64");
}

export const GPS_MARK = "GPS 40.9154N 73.1222W secret";

/** Inserts an EXIF APP1 segment, with a marker string standing in for GPS, after the JPEG SOI. */
export function withExif(jpeg: Buffer): Buffer {
  const tiff = Buffer.concat([
    Buffer.from("Exif\0\0", "binary"),
    Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0, 0, 0, 0]),
    Buffer.from(GPS_MARK, "binary"),
  ]);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(tiff.length + 2);
  return Buffer.concat([
    jpeg.subarray(0, 2),
    Buffer.from([0xff, 0xe1]),
    length,
    tiff,
    jpeg.subarray(2),
  ]);
}
```

- [ ] **Step 2: Write the tests**

`apps/web/e2e/spots.e2e.ts`:

```ts
import type { Page } from "@playwright/test";
import { completeSpot, getSpot, surveyorInvite, tokenOf } from "./api.ts";
import { expect, signIn, test } from "./fixtures.ts";
import { bigJpeg, GPS_MARK, withExif } from "./photo.ts";

async function saveSection(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeHidden();
}

async function openSection(page: Page, name: string): Promise<void> {
  // Row names start with the section, then its state ("Access Missing Never checked").
  await page.getByRole("link", { name: new RegExp(`^${name} `) }).click();
}

test("acceptance 1: a spot made offline with every required field and a photo syncs and publishes", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signIn(page);
  await page.getByRole("link", { name: "New spot" }).click();
  await expect(page.getByRole("searchbox", { name: "Building" })).toBeVisible();
  await page.context().setOffline(true);

  const name = `Offline Corner ${Date.now()}`;
  await page.getByRole("searchbox", { name: "Building" }).fill("melv");
  await page.getByRole("button", { name: "Melville Library" }).click();
  await page.getByRole("textbox", { name: "Floor" }).fill("2");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  await page.getByRole("textbox", { name: "How to get there" }).fill("Main doors, stairs to 2.");
  await page.getByRole("button", { name: "Create spot" }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Offline" })).toBeVisible();

  await openSection(page, "Access");
  await page.getByRole("radio", { name: "Any student" }).check();
  await saveSection(page);
  await openSection(page, "Seating");
  await page.getByRole("textbox", { name: "Seats" }).fill("40");
  await saveSection(page);
  await openSection(page, "Power and signal");
  await page.getByRole("textbox", { name: "Seats near an outlet" }).fill("60");
  await saveSection(page);
  await openSection(page, "Noise and feel");
  await page.getByRole("radio", { name: "Quiet", exact: true }).check();
  await saveSection(page);
  await openSection(page, "House rules");
  await page.getByRole("radio", { name: "Covered drinks" }).check();
  await page.getByRole("group", { name: "Group work" }).getByRole("radio", { name: "No" }).check();
  await saveSection(page);
  await openSection(page, "Hours");
  await page
    .getByRole("group", { name: "Mon" })
    .getByRole("checkbox", { name: "Closed" })
    .uncheck();
  await page.getByRole("button", { name: "Copy Monday to weekdays" }).click();
  await saveSection(page);

  await openSection(page, "Photos");
  const photo = withExif(await bigJpeg(page));
  await page.getByTestId("photo-library").setInputFiles({
    name: "IMG_0001.jpg",
    mimeType: "image/jpeg",
    buffer: photo,
  });
  await expect(page.getByText("Not synced yet")).toBeVisible();
  await page.getByRole("link", { name: "Back" }).click();

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(
    page.getByRole("button", { name: "Publish queued. It goes live after this phone syncs." }),
  ).toBeVisible();
  await expect(page.getByText("Publish queued", { exact: true })).toBeVisible();

  await page.context().setOffline(false);
  await expect(page.getByRole("button", { name: "All synced" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").at(-1) ?? "";
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  const token = await tokenOf(page);
  const server = await getSpot(token, id);
  expect(server.status).toBe("published");
  expect(server.missing).toEqual([]);
  expect(server.hours.filter((h) => !h.is_exam)).toHaveLength(5);
  expect(server.photos).toHaveLength(1);

  // The stored photo: a JPEG at most 1600 px on its longest side and 1.5 MB, with no EXIF.
  const photoId = server.photos[0]?.id ?? "";
  const res = await fetch(`http://127.0.0.1:8787/survey/photos/${photoId}/image`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const bytes = Buffer.from(await res.arrayBuffer());
  expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  expect(bytes.length).toBeLessThanOrEqual(1_500_000);
  expect(bytes.includes(Buffer.from("Exif\0\0", "binary"))).toBe(false);
  expect(bytes.includes(Buffer.from(GPS_MARK, "binary"))).toBe(false);
  const size = await page.evaluate(async (b64) => {
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([raw], { type: "image/jpeg" }));
    return [bitmap.width, bitmap.height];
  }, bytes.toString("base64"));
  expect(size).toEqual([1600, 1200]);
});

test("acceptance 4: a conflicting edit from two phones resolves both ways", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  await signIn(page);
  const spot = await completeSpot(await tokenOf(page), `Two Phones ${Date.now()}`);
  const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phoneB = await other.newPage();
  await signIn(phoneB);
  for (const p of [page, phoneB]) await p.goto(`/survey/spots/${spot.id}`);
  await expect(phoneB.getByRole("heading", { name: spot.official_name, level: 1 })).toBeVisible();

  // In-app navigation, as on a phone: an offline reload is covered in finish.e2e.ts.
  const edit = async (p: Page, seats: string) => {
    await openSection(p, "Seating");
    await p.getByRole("textbox", { name: "Seats" }).fill(seats);
    await saveSection(p);
  };

  // Keep mine: phone B's offline edit wins over phone A's.
  await other.setOffline(true);
  await edit(phoneB, "11");
  await edit(page, "22");
  await expect(page.getByRole("button", { name: "All synced" })).toBeVisible();
  await other.setOffline(false);
  await expect(
    phoneB.getByText("Someone else changed this spot. Pick which version to keep."),
  ).toBeVisible({
    timeout: 60_000,
  });
  await phoneB.getByRole("button", { name: "Open", exact: true }).click();
  await expect(phoneB.getByRole("cell", { name: "11" })).toBeVisible();
  await expect(phoneB.getByRole("cell", { name: "22" })).toBeVisible();
  await phoneB.getByRole("button", { name: "Keep mine" }).click();
  await expect(phoneB.getByRole("button", { name: "All synced" })).toBeVisible({ timeout: 60_000 });
  expect((await getSpot(await tokenOf(page), spot.id)).seat_count).toBe(11);

  // Keep theirs: phone A's edit stays and B's is dropped. A first loads B's kept version.
  await page.reload();
  await expect(page.getByRole("heading", { name: spot.official_name, level: 1 })).toBeVisible();
  await other.setOffline(true);
  await edit(phoneB, "33");
  await edit(page, "44");
  await expect(page.getByRole("button", { name: "All synced" })).toBeVisible();
  await other.setOffline(false);
  await phoneB.getByRole("button", { name: "Open", exact: true }).click({ timeout: 60_000 });
  await phoneB.getByRole("button", { name: "Keep theirs" }).click();
  await expect(phoneB.getByRole("button", { name: "All synced" })).toBeVisible({ timeout: 60_000 });
  expect((await getSpot(await tokenOf(page), spot.id)).seat_count).toBe(44);
  await other.close();
});

test("acceptance 3: a second surveyor can mark a spot reviewed; the one who edited it cannot", async ({
  page,
  browser,
}) => {
  await signIn(page);
  const admin = await tokenOf(page);
  const join = async (name: string) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await context.newPage();
    await p.goto(await surveyorInvite(admin));
    await p.getByRole("textbox", { name: "Your name" }).fill(name);
    await p.getByRole("button", { name: "Join" }).click();
    await expect(p.getByRole("heading", { name: "Spots", level: 1 })).toBeVisible();
    return { context, page: p };
  };
  const editor = await join("Riley Editor");
  const reviewer = await join("Sam Reviewer");
  const spot = await completeSpot(await tokenOf(editor.page), `Review Rule ${Date.now()}`, {
    publish: true,
  });

  await editor.page.goto(`/survey/spots/${spot.id}`);
  await expect(
    editor.page.getByText("You edited this last, so someone else reviews it."),
  ).toBeVisible();
  await expect(editor.page.getByRole("button", { name: "Looks right" })).toBeHidden();

  await reviewer.page.goto(`/survey/spots/${spot.id}`);
  await reviewer.page.getByRole("button", { name: "Looks right" }).click();
  await expect(reviewer.page.getByRole("button", { name: "Marked reviewed" })).toBeVisible();
  expect((await getSpot(admin, spot.id)).review_state).toBe("reviewed");
  await editor.context.close();
  await reviewer.context.close();
});

test("a 60-character spot name at 360 px truncates in the header and nothing scrolls sideways", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await signIn(page);
  const name = `Graduate Reading Room North Wing Lower Level ${Date.now()}`.padEnd(60, "x");
  const spot = await completeSpot(await tokenOf(page), name);
  await page.goto(`/survey/spots/${spot.id}`);
  const title = page.getByRole("heading", { name, level: 1 });
  await expect(title).toBeVisible();
  const [overflow, clipped] = await title.evaluate((el) => [
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    el.scrollWidth > el.clientWidth,
  ]);
  expect(overflow).toBe(0);
  expect(clipped).toBe(true);
  await expect(page.getByRole("button", { name: "All synced" })).toBeInViewport();
});
```

- [ ] **Step 3: Run them**

Run: `(cd apps/web && bun run e2e)`
Expected: 8 passed (part 1's 4 and these 4). If acceptance 4 fails on its second round with phone A in conflict, check that `staleTime` is 0 in `createQueryClient` (the reload must refetch phone B's kept version).

- [ ] **Step 4: Typecheck, lint, commit**

Run: `bun run fix && bun run typecheck && bun run lint && bun run --filter '@study-spot/web' test`
Expected: all pass.

```bash
git add apps/web/e2e
git commit -m "test(web): cover offline publish, conflicts, and review end to end"
```

Part 2 is done: 72 web unit tests and 8 Playwright tests pass, and a surveyor can create, fill, check, photograph, publish, and review spots offline first.

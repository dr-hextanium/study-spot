# Surveyor 2a Web UI Implementation Plan (Plan D), Part 3 of 3: Admin, Acceptance, Audit, DESIGN.md

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Start after parts 1 and 2 (`2026-10-04-surveyor-2a-web-1-foundation.md`, `2026-10-04-surveyor-2a-web-2-screens.md`) are merged. Tasks 16 and 18 dispatch Impeccable agents; Task 16's fixes come from findings, so its steps are a procedure with exact commands and pass conditions.

**Goal:** An admin can run the crew and the publish pipeline from a phone (invite links with a role, sign-in links for lost phones that keep the surveyor's role, removing access, publish status with readable warnings and Publish now, approving and rejecting photos); the remaining automatable acceptance items pass end to end (the published bundle has the spot and its approved cover, an invite and re-login round trip, the app opening offline from the service worker, a tab dying mid-send); the Impeccable detector and an audit pass are clean against the direction contract; decision 19 and the stack notes are recorded; and `DESIGN.md` is written by the Impeccable documenter from the built screens.

**Architecture:** `/survey/admin` is admin-only (others are sent to the list) and online-only (every action needs the server; offline shows the reason and disables actions). Its data is TanStack Query under `["admin", ...]` keys, never persisted. Invite links come back from the server already carrying `?relogin=1` for existing surveyors (part 1, Task 2). Photo approval and rejection merge the returned spot into the cache. The e2e tests reuse part 1's server and fixtures and part 2's API helpers.

**Tech Stack:** as parts 1 and 2; Impeccable 4.5 (`impeccable detect`, `/impeccable audit`, agents `impeccable:impeccable-finish-reviewer` and `impeccable:impeccable-documenter`).

**Spec:** `docs/superpowers/specs/2026-10-04-surveyor-tooling-design.md` sections 7 (`/survey/admin`), 8 (design track step 5: detector and audit before 2a ships), 9, 10, 12 (acceptance 2). Journey E. Contract FINISH line: "this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance". Design tooling rules: `docs/context/design-tooling.md` (fix real findings; ignores only through `impeccable hooks ignore-value`).

## Global Constraints

Parts 1 and 2's constraints hold: strict TypeScript (no `any`, no `!`, no enums), `.ts`/`.tsx` extensions, Zod at trust boundaries, copy only through `t()`/`plural()`, CSS only from token variables with 44 px targets and shadows only on sheets, no em-dashes, Conventional Commits under 72 characters with no attribution, and every commit passing `bun run typecheck && bun run lint && bun test && bun run --filter '@study-spot/web' test` after `bun run fix`. Detector ignores are added only with the Impeccable CLI, never by editing config by hand.

## Review Focus

1. **A lost phone.** An admin issues a sign-in link for an existing surveyor; it must keep their role (an admin's link signs them in as an admin), skip the name prompt, and work once. Removing access must sign the old phone out on its next request. Tests: Task 14 (`admin.test.tsx`: "a new sign-in link keeps the surveyor's role…"), Task 15 (`finish.e2e.ts`: "an admin invites a surveyor…").
2. **Publishing what the surveyor just did.** After Publish now, `bundle-latest.json` points at a bundle that contains the spot and its cover photo URL on the data site. Test: Task 15 (acceptance 2, reading the files the server published).
3. **Offline first open.** After one online visit the app opens with the network off: the service worker serves the shell and the persisted cache fills the list and the spot. Test: Task 15 ("the app opens offline from the service worker…").
4. **A tab closed mid-send.** Its in-flight write is taken over by the other tab within the recheck interval, without a reload. Test: Task 15 ("a tab closed mid-send leaves its change to the other tab…").
5. **The contract's signature against the detector.** The stamp's slight overshoot (`cubic-bezier(0.3, 1.4, 0.5, 1)`) is flagged as bounce easing; it is the contract's named signature, so it is recorded as a reasoned ignore, and every other finding is fixed. Check: Task 16.

## File Structure

```
apps/web/src/screens/Admin.tsx  admin.css
apps/web/src/routes/survey.admin.tsx  survey.index.tsx (replaced: Admin link for admins)
apps/web/src/main.tsx            (imports admin.css)
apps/web/test/harness.tsx        (+ admin routes on TestServer)
apps/web/test/admin.test.tsx
apps/web/e2e/finish.e2e.ts
.impeccable/config.json          (+ one detector ignore, written by the CLI)
docs/context/overview.md         (+ decision 19)
docs/context/stack.md            (web app stack, hooks location)
DESIGN.md (+ sidecar)            written by the Impeccable documenter
```

---
### Task 14: Admin screen (`/survey/admin`)

Journey E: create an invite link for a surveyor or an admin and copy it; the surveyor list with badges, a new sign-in link per surveyor (made with their role, so an admin's lost-phone link keeps admin), and Remove access with a confirm; the publish status (last published time in campus time, dirty or up to date, last error, skipped spots reworded by `publishWarningText`) with Publish now; photos waiting for approval with Approve and Reject (confirmed). Home shows an Admin link to admins.

**Files:**
- Create: `apps/web/src/screens/Admin.tsx`, `apps/web/src/screens/admin.css`, `apps/web/src/routes/survey.admin.tsx`
- Replace: `apps/web/src/routes/survey.index.tsx`; Modify: `apps/web/src/main.tsx` (import), `apps/web/src/routeTree.gen.ts` (generated)
- Modify: `apps/web/test/harness.tsx` (admin routes on `TestServer`)
- Create: `apps/web/test/admin.test.tsx`

**Interfaces:**
- Produces: route `/survey/admin` (admins only); `Admin()`.
- Produces (tests): `TestServer.admin: { surveyors, invites, published, warnings }` and its admin routes (`POST /admin/invites`, `GET /admin/surveyors`, `POST /admin/surveyors/:id/revoke`, `GET` and `POST /admin/publish`, `GET /admin/photos/pending`).
- Consumes: `api.createInvite`, `listSurveyors`, `revokeSurveyor`, `publishStatus`, `publishNow`, `pendingPhotos`, `approvePhoto`, `rejectPhoto`; `publishWarningText`; `share.share`; part 1 and 2 components and hooks (`usePhotoUrl`, `useCampusTz`, `useSpotList`).

- [ ] **Step 1: Teach the test server the admin routes**

In `apps/web/test/harness.tsx`, add `import { z } from "zod";` after the `react` import, and after `export const API = ...` add:

```ts
const Invite = z.object({ role: z.string(), surveyor_id: z.string().optional() });
```

In `class TestServer`, after `readonly reads: string[] = [];`, add:

```ts
  /** Admin routes, answered from this state. */
  readonly admin: {
    surveyors: SurveyorPublic[];
    invites: z.infer<typeof Invite>[];
    published: number;
    warnings: string[];
  } = { surveyors: [], invites: [], published: 0, warnings: [] };
```

In `send`, after the `/survey/campus` branch, add:

```ts
    const admin = this.adminRoute(
      req.method,
      path,
      req.body?.kind === "json" ? req.body.json : null,
    );
    if (admin !== null) return admin;
```

and add this method at the end of the class:

```ts
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
      if (method === "POST") this.admin.published += 1;
      const published = this.admin.published > 0;
      return ok({
        dirty: !published,
        running: false,
        last_published_at: published ? "2026-10-13T18:00:00.000Z" : null,
        last_hash: null,
        last_attempt_at: null,
        warnings: this.admin.warnings,
        last_error: null,
      });
    }
    if (path === "/admin/photos/pending") return ok({ photos: [] });
    return null;
  }
```

- [ ] **Step 2: Write the failing tests**

`apps/web/test/admin.test.tsx`:

```tsx
import { t } from "@study-spot/ui-logic";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { surveySpotFixture } from "../../../packages/core/test/fixtures/survey-spot.ts";
import { ME, renderRoute, testApp } from "./harness.tsx";

const ADMIN = { ...ME, role: "admin" as const };
const RILEY = {
  id: "5f0c7d1e-1c2b-4a3d-9e8f-7a6b5c4d3e2f",
  display_name: "Riley",
  role: "surveyor" as const,
  active: true,
};

test("only admins reach the admin screen, and home links to it for them", async () => {
  const view = renderRoute(testApp(), "/survey/admin");
  await waitFor(() => expect(view.router.state.location.pathname).toBe("/survey"));
  expect(screen.queryByRole("link", { name: t("home.admin") })).toBeNull();

  renderRoute(testApp({ me: ADMIN }), "/survey");
  expect(await screen.findByRole("link", { name: t("home.admin") })).toBeTruthy();
});

test("an admin creates an invite link and copies it", async () => {
  const app = testApp({ me: ADMIN });
  renderRoute(app, "/survey/admin");
  fireEvent.click(await screen.findByRole("radio", { name: t("admin.invite.role.admin") }));
  fireEvent.click(screen.getByRole("button", { name: t("admin.invite.create") }));
  expect(await screen.findByText(t("admin.invite.created"))).toBeTruthy();
  expect(app.server.admin.invites).toEqual([{ role: "admin" }]);
  fireEvent.click(screen.getByRole("button", { name: t("admin.invite.copy") }));
  expect(await screen.findByText(t("admin.invite.copied"))).toBeTruthy();
});

test("a new sign-in link keeps the surveyor's role, and removing access asks first", async () => {
  const app = testApp({ me: ADMIN });
  app.server.admin.surveyors.push(ADMIN, RILEY);
  renderRoute(app, "/survey/admin");
  const list = await screen.findByRole("region", { name: t("admin.surveyors.title") });
  fireEvent.click(await within(list).findByRole("button", { name: t("admin.invite.relogin") }));
  expect(
    await screen.findByText(t("admin.invite.relogin.created", { name: "Riley" })),
  ).toBeTruthy();
  expect(app.server.admin.invites).toEqual([{ role: "surveyor", surveyor_id: RILEY.id }]);
  fireEvent.click(within(list).getByRole("button", { name: t("admin.revoke") }));
  const confirm = await screen.findByRole("dialog", {
    name: t("admin.revoke.confirm.title", { name: "Riley" }),
  });
  fireEvent.click(within(confirm).getByRole("button", { name: t("admin.revoke.confirm.action") }));
  expect(await screen.findByText(t("admin.revoke.done", { name: "Riley" }))).toBeTruthy();
  expect(app.server.admin.surveyors.find((s) => s.id === RILEY.id)?.active).toBe(false);
});

test("publish status reads the server's warnings in the deck's words, and Publish now runs it", async () => {
  const sac = surveySpotFixture({ slug: "sac-lounge", official_name: "SAC Lounge" });
  const app = testApp({ me: ADMIN, spots: [sac] });
  app.server.admin.warnings.push("skipped sac-lounge: missing directions");
  renderRoute(app, "/survey/admin");
  expect(await screen.findByText(t("admin.publish.never"))).toBeTruthy();
  expect(await screen.findByText("SAC Lounge: missing How to get there")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t("admin.publish.now") }));
  expect(await screen.findByText(t("admin.publish.clean"))).toBeTruthy();
});

test("offline, admin actions are disabled with the reason", async () => {
  const app = testApp({ me: ADMIN });
  app.network.set(false);
  renderRoute(app, "/survey/admin");
  expect(await screen.findByText(t("error.network_admin"))).toBeTruthy();
  expect(screen.getByRole("button", { name: t("admin.invite.create") })).toHaveProperty(
    "disabled",
    true,
  );
});
```

Run: `bun run --filter '@study-spot/web' test`
Expected: FAIL; `/survey/admin` is not a route and Home has no Admin link.

- [ ] **Step 3: Write the screen, its styles, and the route**

`apps/web/src/screens/admin.css`:

```css
/* Admin screen of survey mode. Tokens only. */

.admin-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.created-link {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-xs);
  padding: var(--space-sm) 0;
  border-bottom: var(--size-rule) solid var(--color-border);
}

.created-link__url {
  font-family: var(--font-mono);
  font-size: var(--fontSize-small);
  font-weight: 500;
  user-select: all;
}

.entry--stack {
  flex-wrap: wrap;
}

.entry__name {
  display: block;
  font-weight: 600;
}
```

In `apps/web/src/main.tsx`, import it after the spot stylesheet:

```ts
import "./screens/spot.css";
import "./screens/admin.css";
```

`apps/web/src/screens/Admin.tsx`:

```tsx
import type { SurveyorRole } from "@study-spot/core";
import { publishWarningText, t } from "@study-spot/ui-logic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useDeps } from "../app/AppProvider.tsx";
import { keys } from "../app/keys.ts";
import { unwrap } from "../app/queries.ts";
import { useOnline } from "../hooks/useOnline.ts";
import { usePhotoUrl } from "../hooks/usePhotoUrl.ts";
import { useCampusTz, useQueryDeps, useSpotList } from "../hooks/useQueries.ts";
import { useSession } from "../hooks/useSession.ts";
import { useToasts } from "../hooks/useToasts.tsx";
import { dateTime } from "../lib/format.ts";
import { Banner } from "../ui/Banner.tsx";
import { Button } from "../ui/Button.tsx";
import { GroupHeading, Screen } from "../ui/Screen.tsx";
import { Segmented } from "../ui/Segmented.tsx";
import { ConfirmSheet } from "../ui/Sheet.tsx";
import { StampChip } from "../ui/StampChip.tsx";
import { SurveyHeader } from "./SurveyHeader.tsx";

function Section(props: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={props.id} className="admin-section">
      <GroupHeading id={props.id}>{props.title}</GroupHeading>
      {props.children}
    </section>
  );
}

/** A link shown once after it is made, with Copy link. */
function CreatedLink(props: { url: string; note: string }) {
  const { share } = useDeps();
  const toasts = useToasts();
  return (
    <div className="created-link">
      <p className="entered created-link__url">{props.url}</p>
      <p className="field__helper">{props.note}</p>
      <Button
        onClick={async () => {
          const result = await share.share({ title: t("app.name"), url: props.url });
          toasts.show(result === "failed" ? t("error.generic") : t("admin.invite.copied"));
        }}
      >
        {t("admin.invite.copy")}
      </Button>
    </div>
  );
}

function InviteSection(props: { online: boolean }) {
  const { api } = useDeps();
  const toasts = useToasts();
  const [role, setRole] = useState<SurveyorRole>("surveyor");
  const [url, setUrl] = useState<string | null>(null);
  async function create() {
    const res = await api.createInvite({ role });
    if (res.kind === "ok") setUrl(res.value.url);
    else toasts.show(t("error.generic"));
  }
  return (
    <Section id="admin-invite" title={t("admin.invite.title")}>
      <Segmented
        label={t("admin.invite.title")}
        options={[
          { value: "surveyor", label: t("admin.invite.role.surveyor") },
          { value: "admin", label: t("admin.invite.role.admin") },
        ]}
        value={role}
        onChange={setRole}
      />
      <Button variant="primary" disabled={!props.online} onClick={() => void create()}>
        {t("admin.invite.create")}
      </Button>
      {url === null ? null : <CreatedLink url={url} note={t("admin.invite.created")} />}
    </Section>
  );
}

function SurveyorsSection(props: { online: boolean }) {
  const { api } = useDeps();
  const qd = useQueryDeps();
  const qc = useQueryClient();
  const toasts = useToasts();
  const { me } = useSession();
  const surveyors = useQuery({
    queryKey: keys.surveyors,
    queryFn: async () => unwrap(await api.listSurveyors(), qd.onUnauthorized),
    enabled: props.online,
  });
  const [relogin, setRelogin] = useState<{ name: string; url: string } | null>(null);
  const [revoking, setRevoking] = useState<{ id: string; name: string } | null>(null);
  const others = (surveyors.data?.surveyors ?? []).filter((s) => s.id !== me?.id);

  async function newLink(s: { id: string; role: SurveyorRole; display_name: string }) {
    // The role is kept: an admin's sign-in link signs them in as an admin again.
    const res = await api.createInvite({ role: s.role, surveyor_id: s.id });
    if (res.kind === "ok") setRelogin({ name: s.display_name, url: res.value.url });
    else toasts.show(t("error.generic"));
  }
  async function revoke() {
    const target = revoking;
    setRevoking(null);
    if (target === null) return;
    const res = await api.revokeSurveyor(target.id);
    if (res.kind !== "ok") return toasts.show(t("error.generic"));
    toasts.show(t("admin.revoke.done", { name: target.name }));
    await qc.invalidateQueries({ queryKey: keys.surveyors });
  }
  return (
    <Section id="admin-surveyors" title={t("admin.surveyors.title")}>
      {surveyors.isPending && props.online ? <p className="empty">{t("common.loading")}</p> : null}
      {surveyors.data !== undefined && others.length === 0 ? (
        <p className="empty">{t("admin.surveyors.empty")}</p>
      ) : null}
      <ul className="ruled-list">
        {others.map((s) => (
          <li key={s.id} className="entry entry--stack">
            <span className="entry__text">
              <span className="entry__name">{s.display_name}</span>
              <span className="stamp-row">
                {s.role === "admin" ? (
                  <StampChip tone="ink">{t("admin.surveyors.admin_badge")}</StampChip>
                ) : null}
                {s.active ? null : (
                  <StampChip tone="red">{t("admin.surveyors.inactive")}</StampChip>
                )}
              </span>
            </span>
            <span className="entry__actions">
              <Button disabled={!props.online} onClick={() => void newLink(s)}>
                {t("admin.invite.relogin")}
              </Button>
              {s.active ? (
                <Button
                  variant="quiet"
                  disabled={!props.online}
                  onClick={() => setRevoking({ id: s.id, name: s.display_name })}
                >
                  {t("admin.revoke")}
                </Button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {relogin === null ? null : (
        <CreatedLink
          url={relogin.url}
          note={t("admin.invite.relogin.created", { name: relogin.name })}
        />
      )}
      <ConfirmSheet
        open={revoking !== null}
        title={t("admin.revoke.confirm.title", { name: revoking?.name ?? "" })}
        body={t("admin.revoke.confirm.body")}
        action={t("admin.revoke.confirm.action")}
        cancel={t("common.cancel")}
        destructive
        onCancel={() => setRevoking(null)}
        onConfirm={() => void revoke()}
      />
    </Section>
  );
}

function PublishSection(props: { online: boolean }) {
  const { api } = useDeps();
  const qd = useQueryDeps();
  const qc = useQueryClient();
  const tz = useCampusTz();
  const list = useSpotList();
  const [running, setRunning] = useState(false);
  const status = useQuery({
    queryKey: keys.publish,
    queryFn: async () => unwrap(await api.publishStatus(), qd.onUnauthorized),
    enabled: props.online,
  });
  async function publishNow() {
    setRunning(true);
    const res = await api.publishNow();
    setRunning(false);
    if (res.kind === "ok") qc.setQueryData(keys.publish, res.value);
  }
  const s = status.data;
  return (
    <Section id="admin-publish" title={t("admin.publish.title")}>
      {s === undefined ? null : (
        <>
          <p>
            {s.last_published_at === null
              ? t("admin.publish.never")
              : t("admin.publish.last", { time: dateTime(s.last_published_at, tz) })}
          </p>
          <div className="stamp-row">
            {s.dirty ? (
              <StampChip tone="amber">{t("admin.publish.dirty")}</StampChip>
            ) : (
              <StampChip tone="green">{t("admin.publish.clean")}</StampChip>
            )}
          </div>
          {s.last_error === null ? null : (
            <Banner>{t("admin.publish.error", { reason: s.last_error })}</Banner>
          )}
          {s.warnings.length === 0 ? null : (
            <>
              <p className="label">{t("admin.publish.warnings.title")}</p>
              <ul className="ruled-list">
                {s.warnings.map((w) => (
                  <li key={w} className="entry">
                    <span className="entry__text">
                      {publishWarningText(w, list.data?.spots ?? [])}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <Button
        variant="primary"
        disabled={!props.online || running || s?.running === true}
        onClick={() => void publishNow()}
      >
        {running || s?.running === true ? t("admin.publish.running") : t("admin.publish.now")}
      </Button>
    </Section>
  );
}

function PendingPhoto(props: {
  photo: { id: string; spot_id: string; spot_name: string; uploaded_by_name: string | null };
  online: boolean;
  onReject: (id: string) => void;
  onApprove: (id: string) => void;
}) {
  const url = usePhotoUrl({ photoId: props.photo.id });
  return (
    <li className="photo">
      {url === null ? (
        <div className="photo__img photo__img--empty" />
      ) : (
        <img className="photo__img" src={url} alt="" />
      )}
      <p>
        {t("admin.photos.from", {
          spot: props.photo.spot_name,
          name: props.photo.uploaded_by_name ?? t("common.unknown"),
        })}
      </p>
      <div className="photo__actions">
        <Button
          variant="primary"
          disabled={!props.online}
          onClick={() => props.onApprove(props.photo.id)}
        >
          {t("admin.photos.approve")}
        </Button>
        <Button
          variant="danger"
          disabled={!props.online}
          onClick={() => props.onReject(props.photo.id)}
        >
          {t("admin.photos.reject")}
        </Button>
      </div>
    </li>
  );
}

function PhotosSection(props: { online: boolean }) {
  const { api } = useDeps();
  const qd = useQueryDeps();
  const qc = useQueryClient();
  const toasts = useToasts();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const pending = useQuery({
    queryKey: keys.pendingPhotos,
    queryFn: async () => unwrap(await api.pendingPhotos(), qd.onUnauthorized),
    enabled: props.online,
  });
  async function act(id: string, approve: boolean) {
    const res = approve
      ? await api.approvePhoto(id, { client_write_id: crypto.randomUUID() })
      : await api.rejectPhoto(id, { client_write_id: crypto.randomUUID() });
    if (res.kind !== "ok") return toasts.show(t("error.generic"));
    qc.setQueryData(keys.spot(res.value.id), res.value);
    if (approve) toasts.show(t("photos.approve.done"));
    await qc.invalidateQueries({ queryKey: keys.pendingPhotos });
  }
  const photos = pending.data?.photos ?? [];
  return (
    <Section id="admin-photos" title={t("admin.photos.title")}>
      {pending.data !== undefined && photos.length === 0 ? (
        <p className="empty">{t("admin.photos.empty")}</p>
      ) : null}
      <ul className="photos">
        {photos.map((p) => (
          <PendingPhoto
            key={p.id}
            photo={p}
            online={props.online}
            onApprove={(id) => void act(id, true)}
            onReject={setRejecting}
          />
        ))}
      </ul>
      <ConfirmSheet
        open={rejecting !== null}
        title={t("admin.photos.reject")}
        body={t("admin.photos.reject.confirm")}
        action={t("admin.photos.reject")}
        cancel={t("common.cancel")}
        destructive
        onCancel={() => setRejecting(null)}
        onConfirm={() => {
          const id = rejecting;
          setRejecting(null);
          if (id !== null) void act(id, false);
        }}
      />
    </Section>
  );
}

/** Running the crew and the publish pipeline. Every action here needs the server. */
export function Admin() {
  const online = useOnline();
  return (
    <>
      <SurveyHeader title={t("admin.title")} back={{ to: "/survey" }} />
      <Screen>
        {online ? null : <Banner tone="note">{t("error.network_admin")}</Banner>}
        <InviteSection online={online} />
        <PublishSection online={online} />
        <PhotosSection online={online} />
        <SurveyorsSection online={online} />
      </Screen>
    </>
  );
}
```

`apps/web/src/routes/survey.admin.tsx`:

```tsx
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useSession } from "../hooks/useSession.ts";
import { Admin } from "../screens/Admin.tsx";

export const Route = createFileRoute("/survey/admin")({ component: AdminRoute });

/** Admins only; anyone else goes back to the spot list (the server refuses them too). */
function AdminRoute() {
  const { me } = useSession();
  return me?.role === "admin" ? <Admin /> : <Navigate to="/survey" replace />;
}
```

Replace `apps/web/src/routes/survey.index.tsx`:

```tsx
import { t } from "@study-spot/ui-logic";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useSession } from "../hooks/useSession.ts";
import { Home } from "../screens/Home.tsx";

export const Route = createFileRoute("/survey/")({ component: HomeRoute });

function HomeRoute() {
  const { me } = useSession();
  return (
    <Home
      {...(me?.role === "admin"
        ? {
            admin: (
              <Link to="/survey/admin" className="btn btn--secondary">
                <span className="btn__label">{t("home.admin")}</span>
              </Link>
            ),
          }
        : {})}
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

- [ ] **Step 4: Regenerate the route tree and run the tests**

Run: `VITE_API_BASE_URL=http://127.0.0.1:8787 VITE_DATA_BASE_URL=http://data.localhost:8788 bun run --filter '@study-spot/web' build`
Expected: builds; `routeTree.gen.ts` lists `/survey/admin`.

Run: `bun run --filter '@study-spot/web' test`
Expected: PASS (5 admin tests, 77 web tests in all).

- [ ] **Step 5: Typecheck, lint, commit**

Run: `bun run fix && bun run typecheck && bun run lint && bun run --filter '@study-spot/web' test`
Expected: all pass.

```bash
git add apps/web/src apps/web/test
git commit -m "feat(web): add the admin screen for invites, access, and publishing"
```

### Task 15: Finishing end to end: published bundle, invite round trip, offline open, dead tab

The automatable remainder of spec section 12 and the review focus: acceptance 2 (after Publish now, the bundle on the data site has the spot and its approved cover URL), an admin invite and re-login round trip with Remove access signing the old phone out, the app opening offline from the service worker with the persisted cache, and a tab closed mid-send whose write the other tab sends after its recheck timer, with no reload.

**Files:**
- Create: `apps/web/e2e/finish.e2e.ts`

**Interfaces:**
- Consumes: part 1 `fixtures.ts` (`serverState().publishDir`), part 2 `api.ts` (`completeSpot`, `getSpot`, `tokenOf`) and `photo.ts` (`bigJpeg`); core `parseBundle`; the outbox's `HELD_RECHECK_MS` (15 s) through behavior.

- [ ] **Step 1: Write the tests**

`apps/web/e2e/finish.e2e.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBundle } from "@study-spot/core";
import { completeSpot, getSpot, tokenOf } from "./api.ts";
import { expect, serverState, signIn, test } from "./fixtures.ts";
import { bigJpeg } from "./photo.ts";

test("acceptance 2: after Publish now the data site's bundle has the spot and its approved cover", async ({
  page,
}) => {
  await signIn(page);
  const token = await tokenOf(page);
  const spot = await completeSpot(token, `Bundle Check ${Date.now()}`, { publish: true });
  await page.goto(`/survey/spots/${spot.id}/photos`);
  await page.getByTestId("photo-library").setInputFiles({
    name: "cover.jpg",
    mimeType: "image/jpeg",
    buffer: await bigJpeg(page, 2000, 1500),
  });
  await expect(page.getByRole("button", { name: "All synced" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Use as cover" }).click();
  await expect(page.getByText("Cover", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "All synced" })).toBeVisible({ timeout: 60_000 });

  await page.goto("/survey/admin");
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByText("Up to date")).toBeVisible({ timeout: 60_000 });

  const dir = serverState().publishDir;
  const pointer = JSON.parse(readFileSync(join(dir, "bundle-latest.json"), "utf8")) as {
    url: string;
  };
  const parsed = parseBundle(JSON.parse(readFileSync(join(dir, pointer.url), "utf8")));
  if (!parsed.ok) throw new Error(parsed.detail);
  const published = parsed.bundle.spots.find((s) => s.id === spot.id);
  expect(published?.official_name).toBe(spot.official_name);
  const cover = (await getSpot(token, spot.id)).photos.find((p) => p.is_cover);
  expect(cover?.url).toMatch(/^http:\/\/data\.localhost:8788\/photos\/[0-9a-f]{64}\.jpg$/);
  expect(JSON.stringify(published)).toContain(cover?.url ?? "missing");
});

test("an admin invites a surveyor, issues a sign-in link that skips the name, and removes access", async ({
  page,
  browser,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page);
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await page.getByRole("button", { name: "Create invite link" }).click();
  const link = await page.locator(".created-link__url").first().innerText();
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const newbie = await phone.newPage();
  await newbie.goto(new URL(link).pathname);
  await newbie.getByRole("textbox", { name: "Your name" }).fill("Jordan Rivera");
  await newbie.getByRole("button", { name: "Join" }).click();
  await expect(newbie.getByRole("heading", { name: "Spots", level: 1 })).toBeVisible();

  await page.reload();
  const row = page.getByRole("listitem").filter({ hasText: "Jordan Rivera" });
  await row.getByRole("button", { name: "New sign-in link" }).click();
  const relogin = new URL(await page.locator(".created-link__url").last().innerText());
  expect(relogin.search).toBe("?relogin=1");
  const second = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const lostPhone = await second.newPage();
  await lostPhone.goto(`${relogin.pathname}${relogin.search}`);
  await expect(lostPhone.getByRole("textbox")).toHaveCount(0);
  await lostPhone.getByRole("button", { name: "Sign in" }).click();
  await expect(lostPhone.getByRole("heading", { name: "Spots", level: 1 })).toBeVisible();

  await row.getByRole("button", { name: "Remove access" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove access" }).click();
  await expect(page.getByText("Jordan Rivera removed")).toBeVisible();
  await newbie.reload();
  await expect(newbie.getByText("Sign in again")).toBeVisible();
  await phone.close();
  await second.close();
});

test("the app opens offline from the service worker with the cached list and spot", async ({
  page,
}) => {
  await signIn(page);
  const spot = await completeSpot(await tokenOf(page), `Offline Open ${Date.now()}`, {
    publish: true,
  });
  await page.reload();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.goto(`/survey/spots/${spot.id}`);
  await expect(page.getByRole("heading", { name: spot.official_name, level: 1 })).toBeVisible();
  // Let the throttled cache persister write before the network goes.
  await page.waitForTimeout(500);
  await page.context().setOffline(true);
  await page.goto("/survey");
  await expect(page.getByRole("button", { name: "Offline" })).toBeVisible();
  const stale = page.getByRole("region", { name: "Oldest checks" });
  await expect(stale.getByText(spot.official_name)).toBeVisible();
  await stale.getByText(spot.official_name).click();
  await expect(page.getByRole("heading", { name: spot.official_name, level: 1 })).toBeVisible();
  await page.context().setOffline(false);
});

test("a tab closed mid-send leaves its change to the other tab, which sends it", async ({
  page,
  context,
}) => {
  await signIn(page);
  const spot = await completeSpot(await tokenOf(page), `Two Tabs ${Date.now()}`);
  const second = await context.newPage();
  await second.goto("/survey");
  await expect(second.getByRole("button", { name: "All synced" })).toBeVisible();

  // The first tab's request never answers, then the tab is closed.
  await page.route("**/survey/spots/*/seating", () => {});
  await page.goto(`/survey/spots/${spot.id}/seating`);
  await page.getByRole("textbox", { name: "Seats" }).fill("77");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Syncing 1" })).toBeVisible();
  await page.close();

  // No reload: the second tab's recheck timer (15 s) finds the dead tab's write.
  await expect(second.getByRole("button", { name: "All synced" })).toBeVisible({ timeout: 45_000 });
  expect((await getSpot(await tokenOf(second), spot.id)).seat_count).toBe(77);
});
```

- [ ] **Step 2: Run them**

Run: `(cd apps/web && bun run e2e)`
Expected: 12 passed. The dead-tab test takes about 16 s (one recheck interval).

- [ ] **Step 3: Typecheck, lint, commit**

Run: `bun run fix && bun run typecheck && bun run lint`
Expected: all pass.

```bash
git add apps/web/e2e/finish.e2e.ts
git commit -m "test(web): cover publishing, re-login, offline open, and dead tabs"
```

### Task 16: Impeccable detector, audit pass, and finish review

Spec section 8 step 5 and the contract's FINISH line: the detector over the changed UI files and the running screens, an `/impeccable audit` pass at phone widths in light and dark, the finish review against the direction contract, and fixes for every real finding. The one expected detector finding is the contract's own signature (the stamp's slight overshoot), recorded as a reasoned ignore through the CLI. Findings decide the fixes, so the steps are commands with pass conditions; each fix lands in its own commit with a test where behavior changes.

**Files:**
- Modify: `.impeccable/config.json` (through the CLI only)
- Modify: files named by findings (only under `apps/web/src`, `apps/web/test`, `apps/web/e2e`)

**Interfaces:**
- Consumes: the built app, the e2e server (`apps/server/scripts/e2e-server.ts`), the Impeccable CLI and agents.

- [ ] **Step 1: Scan the source**

Run:

```bash
IMPECCABLE="$HOME/.claude/plugins/cache/impeccable/impeccable/4.5.0/skills/impeccable/scripts/impeccable"
"$IMPECCABLE" detect apps/web/src
```

Expected: no findings (exit 0). Fix any finding in the named file, rerun until clean.

- [ ] **Step 2: Scan the running screens at 360 px**

Start both servers in the background and wait for them:

```bash
E2E_STATE=/tmp/perch-e2e.json node apps/server/scripts/e2e-server.ts > /tmp/perch-api.log 2>&1 &
API=$!
(cd apps/web && VITE_API_BASE_URL=http://127.0.0.1:8787 VITE_DATA_BASE_URL=http://data.localhost:8788 bun run build)
(cd apps/web && bun run preview > /tmp/perch-web.log 2>&1) &
WEB=$!
for i in $(seq 60); do curl -sf http://127.0.0.1:8787/health && curl -sf -o /dev/null http://localhost:4173 && break; sleep 1; done
```

Keep them running through Step 4, then stop them with `kill $API $WEB` (and check `lsof -i :8787 -i :4173` shows nothing).

Then scan the screens that need no sign-in (the URL scanner has no session):

```bash
export IMPECCABLE_BROWSER="$(cd apps/web && node -e "import('@playwright/test').then((m) => console.log(m.chromium.executablePath()))")"
"$IMPECCABLE" detect --viewport 360x800 "http://localhost:4173/invite/$(printf 'c%.0s' $(seq 43))"
"$IMPECCABLE" detect --viewport 360x800 "http://localhost:4173/survey"
```

Expected: exactly one finding, `[bounce-easing] cubic-bezier(0.3, 1.4, 0.5, 1)`. That is `tokens.easing.stamp`, the contract's signature ("lands with a 160 ms press, scale 1.06 to 1, slight overshoot"; reduced motion replaces it with a fade). Record it, with the reason, through the CLI:

```bash
"$IMPECCABLE" hooks ignore-value bounce-easing "cubic-bezier(0.3, 1.4, 0.5, 1)" --shared --reason "contract signature: the stamping press, 160 ms with a slight overshoot; reduced motion uses a fade"
```

Rerun both scans. Expected: no findings.

- [ ] **Step 3: Audit the signed-in screens**

With both servers running, take an invite URL from `/tmp/perch-e2e.json` and run `/impeccable audit` on `http://localhost:4173` at 390 by 844 and 360 by 740, in light and in dark (system color scheme), signed in through that link. Cover: Spots (empty and populated), New spot, a spot overview (draft blocked, draft ready, published unreviewed with the conflict banner), Access, Hours, Busyness, Photos (with a photo waiting), the sync sheet, the conflict sheet, the failed sheet, and Admin. Give the audit the contract (`apps/web/.impeccable/surfaces/apps-web.md`), `PRODUCT.md`, and the craft floor.

Pass conditions: every P0 and P1 finding is fixed; text contrast holds at WCAG AA (7:1 for survey light body text); every target is at least 44 px; focus is visible on the ink band and the sheet; nothing scrolls sideways at 360 px; no screen uses a color, size, or radius outside the token variables. P2 and P3 findings are fixed or listed in the commit body with the reason they wait.

For each fix: write or extend the test that shows it (Vitest for behavior, `shell.e2e.ts` for layout), make the change, run `bun run fix && bun run typecheck && bun run lint && bun run --filter '@study-spot/web' test`, and commit it on its own as `fix(web): <what the finding was>`.

- [ ] **Step 4: Finish review against the direction contract**

Dispatch the `impeccable:impeccable-finish-reviewer` agent with: the contract `apps/web/.impeccable/surfaces/apps-web.md`, `PRODUCT.md`, `packages/ui-logic/src/tokens.ts`, `apps/web/src/ui/styles.css`, `apps/web/src/screens/spot.css`, `apps/web/src/screens/admin.css`, screenshots of the screens listed in Step 3 at 390 by 844 in light and dark (take them with Playwright from the running preview), and `apps/web/public/icons/PROVENANCE.txt`. Ask for the ordered list of material fixes and a verdict.

Pass condition: every material fix in the list is made (with a test where behavior changes, one commit each, `fix(web): ...`), and the verdict is recorded in the Task 18 commit body.

- [ ] **Step 5: Full check and commit the detector config**

Run (servers from Step 2 stopped): `bun run typecheck && bun run lint && bun test && bun run --filter '@study-spot/web' test && (cd apps/web && bun run e2e)`
Expected: all pass, 12 Playwright tests.

```bash
git add .impeccable/config.json
git commit -m "chore(web): record the stamp easing as a contract signature"
```

### Task 17: Record decision 19 and the web stack

The decisions this plan made where the spec was silent go into the decision log, and `stack.md` says where hooks live and what the web app is built on.

**Files:**
- Modify: `docs/context/overview.md` (decision 19), `docs/context/stack.md`

- [ ] **Step 1: Append the decision**

At the end of the decision log in `docs/context/overview.md`, append (if the deploy plan has already added a decision 19, use the next free number here and in part 1's header):

```md
19. Surveyor web UI plan (2026-10-04), detail in `docs/superpowers/plans/2026-10-04-surveyor-2a-web-1-foundation.md` and its parts 2 and 3: `packages/ui-logic` gains `Liveness` and `QueueSignal` adapters; a `syncing` write carries its tab's owner id, `pick` and `start()` leave a live tab's write alone and take over a gone tab's (no owner counts as gone), a pass that skips a live tab's spot rechecks in 15 s, `settle` matches the owner, and the in-process defaults are keyed by the outbox's cache; apps/web uses a per-tab Web Lock and BroadcastChannel. `enqueue` seeds with the larger of the screen's version and the last stored server version. The server cache is TanStack Query persisted to IndexedDB (`query:survey`, survey queries only, each checked by Zod on restore, `gcTime` Infinity because 30 days overflows timers, `staleTime` 0), and every server spot is merged so a version never goes down. The server adds `GET /survey/campus` (campus time zone and buildings) and `?relogin=1` on re-login invite links; the invite screen never accepts on load. Slugs are name plus building id; a location fix counts within 50 m; a check older than 90 days reads as stale. Labels are 13 px full caps; the dark shell is `#2b2e35` with a rule; `radius.control` is 4. Toasts count a write as settled when it leaves the queue. Unpublish and photo approval are online calls. The busyness grid has time blocks as rows. Hours edit one block per day and keep further blocks. Web unit tests run under Vitest (jsdom, excluded from `bun test`), browser tests under Playwright against `apps/server/scripts/e2e-server.ts` (PGlite, fsTarget, a clock starting 2026-10-13). The stamp easing's overshoot is a recorded detector ignore (contract signature). `DESIGN.md` is written from the built screens.
```

- [ ] **Step 2: Update the stack notes**

In `docs/context/stack.md`, replace the `packages/ui-logic` line of the layout block with:

```
packages/ui-logic Presenters, view model, offline outbox, UI copy, design tokens, platform adapter interfaces. No DOM, no React. React hooks live in apps/web/src/hooks for now (they typecheck under ui-logic's no-DOM config, so they can move when apps/mobile exists).
```

and replace the `apps/web` line with:

```
apps/web          React 19 + Vite PWA (vite-plugin-pwa, prompt updates), TanStack Router file routes, TanStack Query persisted to IndexedDB.
```

In the `### Frontend` list, replace the `Surveyor mode` bullet with:

```md
- Surveyor mode: same PWA, routes under `/survey`, bearer session in localStorage. Browser adapters in `apps/web/src/adapters` (IndexedDB through `idb` with timeouts, fetch, Web Locks, BroadcastChannel). Unit tests: Vitest with jsdom (`bun run --filter '@study-spot/web' test`, kept out of `bun test` by `bunfig.toml`). Browser tests: Playwright on a phone profile against the real server (`bun run --filter '@study-spot/web' e2e`).
```

- [ ] **Step 3: Commit**

Run: `bun run lint`
Expected: pass (Markdown is not linted; this checks nothing else changed).

```bash
git add docs/context/overview.md docs/context/stack.md
git commit -m "docs: record web ui decisions and the web stack"
```

### Task 18: DESIGN.md from the built screens

Decision 14 and the contract's FINISH line: `DESIGN.md` is derived from the shipped artifact by the Impeccable documenter, not from intentions, and then becomes the visual authority alongside `tokens.ts` (change both together after this).

**Files:**
- Create: `DESIGN.md` and the documenter's sidecar (the documenter decides its name and place under `.impeccable/`)
- Modify: `docs/context/design-tooling.md` (DESIGN.md now exists), `packages/ui-logic/src/tokens.ts` (doc comment only)

- [ ] **Step 1: Dispatch the documenter**

Dispatch the `impeccable:impeccable-documenter` agent (or run `/impeccable document`) with: the contract `apps/web/.impeccable/surfaces/apps-web.md`, `PRODUCT.md`, `packages/ui-logic/src/tokens.ts`, `apps/web/src/ui/` (components and `styles.css`), `apps/web/src/screens/spot.css` and `admin.css`, the Task 16 screenshots, and `apps/web/public/icons/PROVENANCE.txt`. Ask it to record survey mode as built (student mode is not built; say so), with tokens in the frontmatter matching `tokens.ts` exactly (survey light and dark, type scale, spacing, radius, sizes, durations, easings) and components for: button (primary, secondary, danger, quiet), field, segmented control (row and list), stepper, check line, sheet and confirm sheet, ruled row, stamp chip, postmark (fresh, stale, never, stamping), banner, toast, header band, sync postmark, estimates cell.

Pass conditions: `DESIGN.md` exists at the repo root in the official format (frontmatter tokens, then Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts); every color in its frontmatter equals a value in `tokens.color.survey`; it contains no em-dashes; it names the stamp easing as the signature and the reduced-motion fade.

- [ ] **Step 2: Point the docs at it**

In `docs/context/design-tooling.md`, replace the two sentences from "`DESIGN.md` does not exist yet" to "are the visual authority." with:

```md
`DESIGN.md` (written from the built surveyor screens at the end of the web UI plan) and `packages/ui-logic/src/tokens.ts` are the visual authority; change both together. The direction contract (`apps/web/.impeccable/surfaces/apps-web.md`) still governs new surfaces in this world.
```

In `packages/ui-logic/src/tokens.ts`, replace the first two lines of the `tokens` doc comment:

```ts
 * The Divided Back: Perch's postcard world. Source of truth for tokens until
 * DESIGN.md is written from the built screens; change both together after that.
```

with:

```ts
 * The Divided Back: Perch's postcard world. DESIGN.md records these values as
 * built (web UI plan, Task 18); change both together.
```

- [ ] **Step 3: Full check and commit**

Run: `bun run fix && bun run typecheck && bun run lint && bun test && bun run --filter '@study-spot/web' test`
Expected: all pass.

```bash
git add DESIGN.md .impeccable docs/context/design-tooling.md packages/ui-logic/src/tokens.ts
git commit -m "docs: write design.md from the built survey screens"
```

Put the finish reviewer's verdict (Task 16, Step 4) in the commit body.

## Done criteria (plan D)

- `bun run typecheck`, `bun run lint`, `bun test`, `bun run --filter '@study-spot/web' test` (77 tests), `bun run --filter '@study-spot/web' build`, and `bun run --filter '@study-spot/web' e2e` (12 tests) pass locally and in CI (`check` and `web-e2e` jobs).
- Spec section 12: items 2, 3, and 4 pass end to end; item 1 passes end to end except the real phones and the 5-minute clock, which the deploy plan's acceptance run checks on a real iPhone and Android phone (including the Safari versus installed-app storage split).
- Owner, on a real phone outdoors in direct sun at full brightness: the 13 px full-caps labels, the stamp chips, and the header postmark are readable on Spots, a spot overview, and one section editor. If they are not, raise `fontSize.label` to 14 in `tokens.ts` and `DESIGN.md` together and rerun the copy and component tests.
- Decision 18's requirements are met: Web Locks back the `Lock` adapter, the dead-tab tests run (none skipped), the server cache persists and never lowers a version, and toasts settle on writes leaving the queue.
- The Impeccable detector is clean (one reasoned ignore), the audit's P0 and P1 findings and the finish review's material fixes are made, and `DESIGN.md` exists.
- `docs/ops.md` section 9 (Pages build for `@study-spot/web`, output `apps/web/dist`, env `VITE_API_BASE_URL` and `VITE_DATA_BASE_URL`) matches this app; the deploy plan's Task for the PWA can run.

import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { CreateInviteResponse, SurveySpot } from "@study-spot/core";
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

/** A draft with identity only, so its overview lists the missing required sections as blockers. */
export async function draftSpot(token: string, name: string): Promise<SurveySpot> {
  return SurveySpot.parse(
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
}

/** A spot with every v0-required field, made through the API so a test starts from it. */
export async function completeSpot(
  token: string,
  name: string,
  opts: { publish: boolean } = { publish: false },
): Promise<SurveySpot> {
  const created = await draftSpot(token, name);
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
export async function surveyorInvite(
  adminToken: string,
  role: "surveyor" | "admin" = "surveyor",
): Promise<string> {
  const res = CreateInviteResponse.parse(
    await call(adminToken, "POST", "/admin/invites", { role }),
  );
  const url = new URL(res.url);
  return `${url.pathname}${url.search}`;
}

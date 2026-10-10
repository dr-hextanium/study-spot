import { eq } from "drizzle-orm";
import type { Db } from "../client.ts";
import { building, campus, term } from "../schema/index.ts";
import { BOOTSTRAP_BUILDINGS, BOOTSTRAP_CAMPUS, BOOTSTRAP_TERMS } from "./sbu.ts";

export type BootstrapData = {
  campus: typeof campus.$inferInsert;
  terms: (typeof term.$inferInsert)[];
  buildings: (typeof building.$inferInsert)[];
};

export type Counts = { inserted: number; updated: number; unchanged: number };

export type BootstrapReport = {
  campus: "inserted" | "updated" | "unchanged";
  terms: Counts;
  buildings: Counts;
};

export const SBU_DATA: BootstrapData = {
  campus: BOOTSTRAP_CAMPUS,
  terms: BOOTSTRAP_TERMS,
  buildings: BOOTSTRAP_BUILDINGS,
};

function sameFields<T extends Record<string, unknown>>(existing: T, wanted: T): boolean {
  return Object.keys(wanted).every((key) => (existing[key] ?? null) === (wanted[key] ?? null));
}

/**
 * Upserts the campus, terms and buildings by id. Never deletes, and touches
 * no other table (spots, surveyors, photos, walk matrix). Running it twice
 * changes nothing.
 */
export async function bootstrap(db: Db, data: BootstrapData = SBU_DATA): Promise<BootstrapReport> {
  return db.transaction(async (tx) => {
    const [existingCampus] = await tx.select().from(campus).where(eq(campus.id, data.campus.id));
    let campusResult: BootstrapReport["campus"] = "unchanged";
    if (!existingCampus) {
      await tx.insert(campus).values(data.campus);
      campusResult = "inserted";
    } else if (!sameFields(existingCampus, data.campus)) {
      await tx.update(campus).set(data.campus).where(eq(campus.id, data.campus.id));
      campusResult = "updated";
    }

    const termRows = await tx.select().from(term);
    const termCounts: Counts = { inserted: 0, updated: 0, unchanged: 0 };
    for (const wanted of data.terms) {
      const existing = termRows.find((t) => t.id === wanted.id);
      if (!existing) {
        await tx.insert(term).values(wanted);
        termCounts.inserted += 1;
      } else if (!sameFields(existing, wanted)) {
        await tx.update(term).set(wanted).where(eq(term.id, wanted.id));
        termCounts.updated += 1;
      } else {
        termCounts.unchanged += 1;
      }
    }

    const buildingRows = await tx.select().from(building);
    const buildingCounts: Counts = { inserted: 0, updated: 0, unchanged: 0 };
    for (const wanted of data.buildings) {
      const existing = buildingRows.find((b) => b.id === wanted.id);
      if (!existing) {
        await tx.insert(building).values(wanted);
        buildingCounts.inserted += 1;
      } else if (!sameFields(existing, wanted)) {
        await tx.update(building).set(wanted).where(eq(building.id, wanted.id));
        buildingCounts.updated += 1;
      } else {
        buildingCounts.unchanged += 1;
      }
    }

    return { campus: campusResult, terms: termCounts, buildings: buildingCounts };
  });
}

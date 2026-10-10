import type { SpotList } from "@perch/core";
import { bySeq, type WriteRecord } from "@perch/ui-logic";

/** Spot id to the name a surveyor last saw or typed, for the sync sheet. */
export function spotNames(
  list: SpotList | undefined,
  records: readonly WriteRecord[],
): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const s of list?.spots ?? []) names.set(s.id, s.official_name);
  for (const r of [...records].sort(bySeq)) {
    if (r.kind === "spot.create") names.set(r.spot_id, r.payload.identity.official_name);
    if (r.kind === "spot.section" && r.payload.section === "identity") {
      names.set(r.spot_id, r.payload.data.official_name);
    }
  }
  return names;
}

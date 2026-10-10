import type { Db } from "@perch/db";
import { sql } from "drizzle-orm";
import type { PingRow } from "./counter.ts";

/**
 * One statement that adds the counts to pick_daily. Hours fold into the campus day in SQL.
 * Unknown and unpublished spots are dropped silently.
 */
export async function flushPicks(
  db: Db,
  campusId: string,
  rows: readonly PingRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const values = sql.join(
    rows.map((r) => sql`(${r.spot_id}::uuid, ${r.at}::timestamptz, ${r.count}::int)`),
    sql`, `,
  );
  await db.execute(sql`
    insert into pick_daily (spot_id, day, count)
    select v.spot_id, (v.at at time zone c.tz)::date as day, sum(v.count)::int
    from (values ${values}) as v(spot_id, at, count)
    join spot s on s.id = v.spot_id and s.status = 'published'
    join building b on b.id = s.building_id
    join campus c on c.id = b.campus_id and c.id = ${campusId}
    group by v.spot_id, day
    on conflict (spot_id, day) do update set count = pick_daily.count + excluded.count`);
}

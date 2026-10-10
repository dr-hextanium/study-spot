import { openDb } from "@perch/db";
import { z } from "zod";
import { bootstrapAdminInvite } from "../src/auth/invites.ts";

/** Usage: bun run admin:invite "<display name>" with DATABASE_URL and WEB_ORIGIN set. */
const Args = z.object({
  name: z.string().trim().min(1).max(60),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//),
  WEB_ORIGIN: z.url({ protocol: /^https?$/ }).refine((u) => new URL(u).origin === u),
});

const parsed = Args.safeParse({ ...process.env, name: process.argv[2] });
if (!parsed.success) {
  console.error(`usage: bun run admin:invite "<name>"\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}
const { db, close } = openDb(parsed.data.DATABASE_URL);
try {
  const invite = await bootstrapAdminInvite(db, {
    displayName: parsed.data.name,
    now: new Date(),
    webOrigin: parsed.data.WEB_ORIGIN,
  });
  console.log(
    `admin invite for ${parsed.data.name}, valid until ${invite.expires_at.toISOString()}:`,
  );
  console.log(invite.url);
} finally {
  await close();
}

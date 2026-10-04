import type { SurveyorPublic, SurveyorRole } from "@study-spot/core";
import { auth_session, type Db, invite, surveyor } from "@study-spot/db";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { HttpError } from "../http.ts";
import { createSession } from "./sessions.ts";
import { hashToken, newToken } from "./tokens.ts";

export const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

export type CreatedInvite = { token: string; url: string; expires_at: Date };

export async function createInvite(
  db: Db,
  opts: {
    role: SurveyorRole;
    surveyorId: string | null;
    createdBy: string | null;
    now: Date;
    webOrigin: string;
  },
): Promise<CreatedInvite> {
  if (opts.surveyorId !== null) {
    const [target] = await db
      .select({ id: surveyor.id })
      .from(surveyor)
      .where(eq(surveyor.id, opts.surveyorId));
    if (!target) throw new HttpError(404, { error: "not_found" });
  }
  const token = newToken();
  const expires_at = new Date(opts.now.getTime() + INVITE_TTL_MS);
  await db.insert(invite).values({
    token_hash: hashToken(token),
    role: opts.role,
    surveyor_id: opts.surveyorId,
    created_by: opts.createdBy,
    created_at: opts.now,
    expires_at,
  });
  return { token, url: `${opts.webOrigin}/invite/${token}`, expires_at };
}

/** Why an invite could not be used, for the right message on the invite screen. */
async function inviteError(db: Db, token: string, now: Date): Promise<HttpError> {
  const [row] = await db
    .select()
    .from(invite)
    .where(eq(invite.token_hash, hashToken(token)));
  if (!row) return new HttpError(410, { error: "invite_invalid" });
  if (row.used_at !== null) return new HttpError(410, { error: "invite_used" });
  if (row.expires_at.getTime() <= now.getTime()) {
    return new HttpError(410, { error: "invite_expired" });
  }
  return new HttpError(410, { error: "invite_invalid" });
}

export type AcceptedInvite = { token: string; surveyor: SurveyorPublic };

const publicColumns = {
  id: surveyor.id,
  display_name: surveyor.display_name,
  role: surveyor.role,
  active: surveyor.active,
};

/**
 * Consumes an invite and opens a session in one transaction. The conditional
 * update makes acceptance single-use even when two requests race. Any error
 * rolls back, leaving the invite unused.
 */
export async function acceptInvite(
  db: Db,
  opts: { token: string; displayName: string | undefined; now: Date },
): Promise<AcceptedInvite> {
  return db.transaction(async (tx) => {
    const [inv] = await tx
      .update(invite)
      .set({ used_at: opts.now })
      .where(
        and(
          eq(invite.token_hash, hashToken(opts.token)),
          isNull(invite.used_at),
          gt(invite.expires_at, opts.now),
        ),
      )
      .returning();
    if (!inv) throw await inviteError(tx, opts.token, opts.now);

    let who: SurveyorPublic | undefined;
    if (inv.surveyor_id !== null) {
      // Re-login link: an admin issued it after any revoke, so it reactivates.
      [who] = await tx
        .update(surveyor)
        .set({ active: true, role: inv.role })
        .where(eq(surveyor.id, inv.surveyor_id))
        .returning(publicColumns);
    } else {
      if (opts.displayName === undefined) {
        throw new HttpError(422, { error: "display_name_required", message: "Add a name." });
      }
      [who] = await tx
        .insert(surveyor)
        .values({ display_name: opts.displayName, role: inv.role, invited_by: inv.created_by })
        .returning(publicColumns);
    }
    if (!who) throw new HttpError(410, { error: "invite_invalid" });
    const token = await createSession(tx, who.id, opts.now);
    return { token, surveyor: who };
  });
}

/** Deactivates a surveyor, ends their sessions, and voids unused invites for or created by them. */
export async function revokeSurveyor(db: Db, surveyorId: string): Promise<SurveyorPublic> {
  return db.transaction(async (tx) => {
    const [who] = await tx
      .update(surveyor)
      .set({ active: false })
      .where(eq(surveyor.id, surveyorId))
      .returning(publicColumns);
    if (!who) throw new HttpError(404, { error: "not_found" });
    await tx.delete(auth_session).where(eq(auth_session.surveyor_id, surveyorId));
    await tx
      .delete(invite)
      .where(
        and(
          or(eq(invite.surveyor_id, surveyorId), eq(invite.created_by, surveyorId)),
          isNull(invite.used_at),
        ),
      );
    return who;
  });
}

/** Bootstrap: creates an admin surveyor with no creator and returns a link for them. */
export async function bootstrapAdminInvite(
  db: Db,
  opts: { displayName: string; now: Date; webOrigin: string },
): Promise<CreatedInvite> {
  return db.transaction(async (tx) => {
    const [admin] = await tx
      .insert(surveyor)
      .values({ display_name: opts.displayName, role: "admin" })
      .returning({ id: surveyor.id });
    if (!admin) throw new Error("failed to insert admin");
    return createInvite(tx, {
      role: "admin",
      surveyorId: admin.id,
      createdBy: null,
      now: opts.now,
      webOrigin: opts.webOrigin,
    });
  });
}

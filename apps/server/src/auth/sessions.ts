import { OpaqueToken, type SurveyorPublic } from "@study-spot/core";
import { auth_session, type Db, surveyor } from "@study-spot/db";
import { eq } from "drizzle-orm";
import { hashToken, newToken } from "./tokens.ts";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type AuthedSurveyor = SurveyorPublic & { sessionId: string };

/** Creates a session and returns the bearer token. Times come from the app clock, never the DB. */
export async function createSession(db: Db, surveyorId: string, now: Date): Promise<string> {
  const token = newToken();
  await db.insert(auth_session).values({
    id: hashToken(token),
    surveyor_id: surveyorId,
    created_at: now,
    expires_at: new Date(now.getTime() + SESSION_TTL_MS),
  });
  return token;
}

/** The token from an `Authorization: Bearer <token>` header, or null. */
export function bearerToken(header: string | undefined): string | null {
  if (header === undefined) return null;
  const match = /^Bearer (\S+)$/.exec(header);
  const parsed = OpaqueToken.safeParse(match?.[1]);
  return parsed.success ? parsed.data : null;
}

/**
 * The active surveyor behind a bearer token, or null. A session expires at
 * expires_at exactly. Past half its lifetime it is renewed to a fresh 30 days.
 */
export async function authenticate(
  db: Db,
  header: string | undefined,
  now: Date,
): Promise<AuthedSurveyor | null> {
  const token = bearerToken(header);
  if (token === null) return null;
  const sessionId = hashToken(token);
  const [row] = await db
    .select({
      expires_at: auth_session.expires_at,
      id: surveyor.id,
      display_name: surveyor.display_name,
      role: surveyor.role,
      active: surveyor.active,
    })
    .from(auth_session)
    .innerJoin(surveyor, eq(surveyor.id, auth_session.surveyor_id))
    .where(eq(auth_session.id, sessionId));
  if (!row?.active || row.expires_at.getTime() <= now.getTime()) return null;

  if (row.expires_at.getTime() - now.getTime() < SESSION_TTL_MS / 2) {
    await db
      .update(auth_session)
      .set({ expires_at: new Date(now.getTime() + SESSION_TTL_MS) })
      .where(eq(auth_session.id, sessionId));
  }
  return {
    id: row.id,
    display_name: row.display_name,
    role: row.role,
    active: row.active,
    sessionId,
  };
}

export async function deleteSession(db: Db, sessionId: string): Promise<void> {
  await db.delete(auth_session).where(eq(auth_session.id, sessionId));
}

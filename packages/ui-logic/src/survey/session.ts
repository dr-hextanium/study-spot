import { OpaqueToken, SurveyorPublic } from "@perch/core";
import { z } from "zod";
import type { KeyValueStorage } from "../adapters.ts";

export const SESSION_KEY = "survey:session";

export const StoredSession = z.object({ token: OpaqueToken, surveyor: SurveyorPublic });
export type StoredSession = z.infer<typeof StoredSession>;

export type SessionStore = {
  /** The stored session, or null when absent, corrupt, or of an old shape. */
  load(): StoredSession | null;
  save(session: StoredSession): void;
  clear(): void;
  token(): string | null;
};

export function createSessionStore(storage: KeyValueStorage, key = SESSION_KEY): SessionStore {
  const load = (): StoredSession | null => {
    try {
      const raw = storage.getItem(key);
      if (raw === null) return null;
      const parsed = StoredSession.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };
  return {
    load,
    save: (session) => storage.setItem(key, JSON.stringify(StoredSession.parse(session))),
    clear: () => storage.removeItem(key),
    token: () => load()?.token ?? null,
  };
}

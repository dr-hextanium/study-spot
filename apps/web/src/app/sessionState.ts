import { SESSION_KEY, type SessionStore, type StoredSession } from "@perch/ui-logic";

/** The stored session as an external store, so screens re-render when it changes in any tab. */
export type SessionState = {
  current(): StoredSession | null;
  token(): string | null;
  /** False when storage refused the write (full disk, blocked storage). */
  save(session: StoredSession): boolean;
  clear(): void;
  subscribe(listener: () => void): () => void;
};

export function createSessionState(store: SessionStore, win: Window = window): SessionState {
  let current = store.load();
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const l of listeners) l();
  };
  win.addEventListener("storage", (e) => {
    if (e.key !== null && e.key !== SESSION_KEY) return;
    current = store.load();
    emit();
  });
  return {
    current: () => current,
    token: () => current?.token ?? null,
    save(session) {
      try {
        store.save(session);
      } catch {
        return false;
      }
      current = session;
      emit();
      return true;
    },
    clear() {
      try {
        store.clear();
      } catch {
        // Nothing to do: the in-memory copy is cleared below either way.
      }
      current = null;
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

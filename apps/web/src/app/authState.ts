/**
 * Signed-out state from reads (a 401 on the list or a spot). The outbox keeps
 * its own flag for writes; the app is signed out when either says so.
 */
export type AuthState = {
  signedOut(): boolean;
  markSignedOut(): void;
  reset(): void;
  subscribe(listener: () => void): () => void;
};

export function createAuthState(): AuthState {
  let out = false;
  const listeners = new Set<() => void>();
  const set = (next: boolean) => {
    if (out === next) return;
    out = next;
    for (const l of listeners) l();
  };
  return {
    signedOut: () => out,
    markSignedOut: () => set(true),
    reset: () => set(false),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

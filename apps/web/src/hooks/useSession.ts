import type { AcceptInviteResponse, SurveyorPublic } from "@study-spot/core";
import { useSyncExternalStore } from "react";
import { useDeps } from "../app/AppProvider.tsx";
import { useOutboxSnapshot } from "./useOutbox.ts";

export type SessionView = {
  me: SurveyorPublic | null;
  /** No session on this phone, or the server refused it (expired, revoked). */
  signedOut: boolean;
  /** Stores a new session and resumes sync. False when storage refused it. */
  join(accepted: AcceptInviteResponse): boolean;
};

export function useSession(): SessionView {
  const { session, auth, outbox, queryClient } = useDeps();
  const stored = useSyncExternalStore(session.subscribe, session.current);
  const readsOut = useSyncExternalStore(auth.subscribe, auth.signedOut);
  const snapshot = useOutboxSnapshot();
  return {
    me: stored?.surveyor ?? null,
    signedOut: stored === null || readsOut || snapshot.signedOut,
    join(accepted) {
      if (!session.save({ token: accepted.token, surveyor: accepted.surveyor })) return false;
      auth.reset();
      outbox.resume();
      void queryClient.invalidateQueries();
      return true;
    },
  };
}

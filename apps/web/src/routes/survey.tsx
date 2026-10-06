import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useOutboxSnapshot } from "../hooks/useOutbox.ts";
import { useSession } from "../hooks/useSession.ts";
import { SignedOut } from "../screens/SignedOut.tsx";

export const Route = createFileRoute("/survey")({ component: SurveyLayout });

/** Asks the browser to confirm closing the tab while changes are still on this phone only. */
function useLeaveGuard(): void {
  const snapshot = useOutboxSnapshot();
  const waiting = snapshot.records.some((r) => r.state === "pending" || r.state === "syncing");
  useEffect(() => {
    if (!waiting) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [waiting]);
}

function SurveyLayout() {
  const { signedOut } = useSession();
  useLeaveGuard();
  // Signing out swaps the screen in place, so no navigation moves focus for it.
  const wasSignedOut = useRef(signedOut);
  useEffect(() => {
    if (signedOut && !wasSignedOut.current) document.querySelector<HTMLElement>("main")?.focus();
    wasSignedOut.current = signedOut;
  }, [signedOut]);
  return signedOut ? <SignedOut /> : <Outlet />;
}

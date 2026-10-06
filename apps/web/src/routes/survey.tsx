import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
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
  return signedOut ? <SignedOut /> : <Outlet />;
}

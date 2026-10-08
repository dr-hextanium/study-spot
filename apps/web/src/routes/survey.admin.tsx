import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useSession } from "../hooks/useSession.ts";
import { Admin } from "../screens/Admin.tsx";

export const Route = createFileRoute("/survey/admin")({ component: AdminRoute });

/** Admins only; anyone else goes back to the spot list (the server refuses them too). */
function AdminRoute() {
  const { me } = useSession();
  return me?.role === "admin" ? <Admin /> : <Navigate to="/survey" replace />;
}

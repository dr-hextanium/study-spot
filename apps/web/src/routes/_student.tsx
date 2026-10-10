import { createFileRoute, Outlet } from "@tanstack/react-router";
import { TabBar } from "../ui/TabBar.tsx";

/** The student shell: the screen column over a bottom tab bar. Surveyor routes never use it. */
function StudentLayout() {
  return (
    <>
      <div className="student">
        <Outlet />
      </div>
      <TabBar />
    </>
  );
}

export const Route = createFileRoute("/_student")({ component: StudentLayout });

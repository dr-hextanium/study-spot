import { createRootRoute, Outlet } from "@tanstack/react-router";

/** The shell's update prompt joins in Task 8. */
export const Route = createRootRoute({ component: Outlet });

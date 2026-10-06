import { createRootRoute, Outlet } from "@tanstack/react-router";
import { UpdatePrompt } from "../screens/UpdatePrompt.tsx";

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <UpdatePrompt />
    </>
  ),
});

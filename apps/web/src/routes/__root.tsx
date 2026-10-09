import { createRootRoute, Outlet, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { NotFound } from "../screens/NotFound.tsx";
import { UpdatePrompt } from "../screens/UpdatePrompt.tsx";

/**
 * After a navigation renders, focus the new screen's main area. The first load keeps the browser's focus.
 * Focus without scrolling: the router has already restored or reset scroll (it used to jump to the header height).
 */
function useFocusOnNavigate(): void {
  const router = useRouter();
  useEffect(
    () =>
      router.subscribe("onRendered", (e) => {
        if (e.pathChanged && e.fromLocation !== undefined)
          document.querySelector<HTMLElement>("main")?.focus({ preventScroll: true });
      }),
    [router],
  );
}

function Root() {
  useFocusOnNavigate();
  return (
    <>
      <Outlet />
      <UpdatePrompt />
    </>
  );
}

export const Route = createRootRoute({ component: Root, notFoundComponent: () => <NotFound /> });

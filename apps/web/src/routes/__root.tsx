import { createRootRoute, Outlet, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { UpdatePrompt } from "../screens/UpdatePrompt.tsx";

/** After a navigation renders, focus the new screen's main area. The first load keeps the browser's focus. */
function useFocusOnNavigate(): void {
  const router = useRouter();
  useEffect(
    () =>
      router.subscribe("onRendered", (e) => {
        if (e.pathChanged && e.fromLocation !== undefined)
          document.querySelector<HTMLElement>("main")?.focus();
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

export const Route = createRootRoute({ component: Root });

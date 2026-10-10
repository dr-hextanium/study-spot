import { t } from "@perch/ui-logic";
import { createRootRoute, Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { NotFound } from "../screens/NotFound.tsx";
import { UpdatePrompt } from "../screens/UpdatePrompt.tsx";
import { Screen } from "../ui/Screen.tsx";

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

/** Unknown addresses: the surveyor screen under /survey, the student one everywhere else. */
function RootNotFound() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (path === "/survey" || path.startsWith("/survey/")) return <NotFound />;
  return (
    <Screen title={t("app.name")}>
      <p className="lede">{t("nav.not_found.body")}</p>
      <p className="inline-action">
        <Link to="/" replace className="btn btn--ink">
          <span className="btn__label">{t("student.notfound.back")}</span>
        </Link>
      </p>
    </Screen>
  );
}

export const Route = createRootRoute({ component: Root, notFoundComponent: RootNotFound });

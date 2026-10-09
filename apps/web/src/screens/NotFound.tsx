import { t } from "@study-spot/ui-logic";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Screen } from "../ui/Screen.tsx";
import { SyncStatus } from "./SyncStatus.tsx";

/**
 * A spot or section that is not on this phone, and any address the app does
 * not know. Always a way back: the bar's arrow and a plain link. (A spot still
 * loading shows its skeleton instead.)
 */
export function NotFound(props: { message?: string; sync?: boolean }) {
  const message = props.message ?? t("nav.not_found.body");
  const trailing: ReactNode = props.sync === true ? <SyncStatus variant="icon" /> : undefined;
  return (
    <Screen
      title={t("app.name")}
      back={{ to: "/survey" }}
      {...(trailing === undefined ? {} : { trailing })}
    >
      <p className="lede">{message}</p>
      <p>
        <Link to="/survey" replace className="btn btn--ink">
          <span className="btn__label">{t("nav.back_to_spots")}</span>
        </Link>
      </p>
    </Screen>
  );
}

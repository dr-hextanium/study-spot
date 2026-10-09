import { t } from "@study-spot/ui-logic";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Screen } from "../ui/Screen.tsx";
import { SyncStatus } from "./SyncStatus.tsx";

/**
 * A spot or section that is loading or not on this phone, and any address the
 * app does not know. Always a way back: the bar's arrow and a plain link.
 */
export function NotFound(props: { message?: string; loading?: boolean; sync?: boolean }) {
  const message = props.message ?? t("nav.not_found.body");
  const trailing: ReactNode = props.sync === true ? <SyncStatus variant="icon" /> : undefined;
  return (
    <Screen
      title={t("app.name")}
      back={{ to: "/survey" }}
      {...(trailing === undefined ? {} : { trailing })}
    >
      <p className="lede">{props.loading === true ? t("common.loading") : message}</p>
      {props.loading === true ? null : (
        <p>
          <Link to="/survey" replace className="btn btn--ink">
            <span className="btn__label">{t("nav.back_to_spots")}</span>
          </Link>
        </p>
      )}
    </Screen>
  );
}

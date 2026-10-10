import { t } from "@perch/ui-logic";
import type { LinkProps } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "./Button.tsx";

/**
 * The sticky bar: back, a small title that fades in once the large title
 * scrolls away (it is aria-hidden; the h1 is the one heading), then trailing actions.
 */
export function TopBar(props: {
  title: string;
  back?: LinkProps;
  trailing?: ReactNode;
  scrolled: boolean;
}) {
  return (
    <header className={`topbar${props.scrolled ? " topbar--scrolled" : ""}`}>
      <div className="topbar__inner">
        {props.back === undefined ? null : (
          <IconButton label={t("common.back")} icon={ArrowLeft} link={props.back} />
        )}
        <span className="topbar__title" aria-hidden="true">
          {props.title}
        </span>
        {props.trailing}
      </div>
    </header>
  );
}

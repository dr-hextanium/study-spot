import { t } from "@study-spot/ui-logic";
import { Link, type LinkProps } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  title: string;
  back?: LinkProps;
  /** Usually the sync postmark. */
  trailing?: ReactNode;
};

/**
 * The printed heading band, solid ink like "POST CARD" on a real card. Its
 * content uses onShell and focusOnShell only; status colors never sit on it.
 */
export function HeaderBand({ title, back, trailing }: Props) {
  return (
    <header className="band">
      {back === undefined ? (
        <span className="band__spacer" />
      ) : (
        <Link
          {...back}
          className="band__back"
          aria-label={t("common.back")}
          activeOptions={{ exact: true }}
        >
          <ArrowLeft aria-hidden="true" size={22} strokeWidth={2.25} />
        </Link>
      )}
      <h1 className="band__title">{title}</h1>
      {trailing}
    </header>
  );
}

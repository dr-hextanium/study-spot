import { Link, type LinkProps } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  label: string;
  /** What is filled in, in ballpoint blue; or a status in its own tone. */
  value?: ReactNode;
  tone?: "value" | "missing" | "muted";
  trailing?: ReactNode;
  /** Where the row goes. Without one the row is a plain line. */
  link?: LinkProps;
};

/** A 44 px ruled line: printed label left, entry under it, a mark at the right. */
export function RuledRow({ label, value, tone = "value", trailing, link }: Props) {
  const body = (
    <>
      <span className="ruled__text">
        <span className="ruled__label">{label}</span>
        {value === undefined ? null : (
          <span className={`ruled__value ruled__value--${tone}`}>{value}</span>
        )}
      </span>
      {trailing}
    </>
  );
  return (
    <li className="ruled">
      {link === undefined ? (
        <div className="ruled__static">{body}</div>
      ) : (
        <Link {...link} className="ruled__link">
          {body}
          <ChevronRight className="ruled__chevron" aria-hidden="true" size={18} strokeWidth={2} />
        </Link>
      )}
    </li>
  );
}

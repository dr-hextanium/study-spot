import { t } from "@study-spot/ui-logic";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";

/**
 * Stand-ins for content that is not here yet. A skeleton never pretends to be
 * data: the blocks are plain mist shapes hidden from assistive tech, the region
 * is aria-busy, and a polite "Loading" from the copy deck says what is going on.
 * The status sits beside the busy region, not in it, and gets its text after it
 * mounts: a live region that arrives already filled is often not read out.
 * `announce={false}` for a second skeleton on the same screen, so it is said once.
 */
export function Loading(props: { children: ReactNode; className?: string; announce?: boolean }) {
  const announce = props.announce ?? true;
  const [said, setSaid] = useState(false);
  useEffect(() => {
    if (!announce) return;
    const id = setTimeout(() => setSaid(true), 0);
    return () => clearTimeout(id);
  }, [announce]);
  return (
    <>
      {announce ? (
        <p role="status" className="visually-hidden">
          {said ? t("common.loading") : ""}
        </p>
      ) : null}
      <div className={props.className} aria-busy="true">
        <div aria-hidden="true" className="skel-group">
          {props.children}
        </div>
      </div>
    </>
  );
}

/** One mist block. `w` is a CSS width; height comes from the variant class. */
export function Skel(props: {
  w?: string;
  kind?: "title" | "line" | "small" | "heading" | "pill" | "chip" | "icon" | "control" | "photo";
}) {
  const style: CSSProperties | undefined = props.w === undefined ? undefined : { width: props.w };
  return <span className={`skel skel--${props.kind ?? "line"}`} style={style} />;
}

const ROW_WIDTHS = ["58%", "44%", "66%", "50%", "38%", "54%", "62%", "46%"];
const END_WIDTHS = ["64px", "48px", "72px", "56px"];

/** Skeleton rows matching Row: optional lead icon, a title line, an end pill. */
export function SkelRows(props: { count: number; lead?: boolean; compact?: boolean }) {
  return (
    <ul className="row-list">
      {Array.from({ length: props.count }, (_, i) => (
        // Placeholders have no identity; the index is the key.
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list
        <li key={i} className="row-item">
          <span className={`row skel-row${props.compact === true ? " row--compact" : ""}`}>
            {props.lead === true ? <Skel kind="icon" /> : null}
            <span className="row__text">
              <Skel w={ROW_WIDTHS[i % ROW_WIDTHS.length] ?? "50%"} />
            </span>
            <Skel kind="pill" w={END_WIDTHS[i % END_WIDTHS.length] ?? "56px"} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The step bar's shape in mist: six todo segments. */
export function SkelStepBar() {
  return (
    <span className="stepbar">
      {Array.from({ length: 6 }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list
        <span key={i} className="stepbar__step" />
      ))}
    </span>
  );
}

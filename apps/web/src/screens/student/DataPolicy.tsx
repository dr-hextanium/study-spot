import { t } from "@perch/ui-logic";
import type { ReactNode } from "react";
import source from "../../../../../docs/data-policy.md?raw";
import { type DocBlock, parseDoc, spans } from "../../lib/policyDoc.ts";
import { GroupHeading, Screen } from "../../ui/Screen.tsx";

const blocks = parseDoc(source);
const title = blocks.find((b) => b.kind === "title")?.text ?? t("student.me.data_policy");

function Inline(props: { text: string }) {
  return (
    <>
      {spans(props.text).map((s) =>
        s.kind === "link" ? (
          <a key={s.key} href={s.href} target="_blank" rel="noopener noreferrer">
            {s.href}
          </a>
        ) : (
          <span key={s.key}>{s.text}</span>
        ),
      )}
    </>
  );
}

function Block(props: { block: DocBlock }): ReactNode {
  const b = props.block;
  switch (b.kind) {
    case "title":
      // The screen's large title already says it.
      return null;
    case "heading":
      return <GroupHeading>{b.text}</GroupHeading>;
    case "paragraph":
      return (
        <p className="policy__p">
          <Inline text={b.text} />
        </p>
      );
    case "list":
      return (
        <ul className="policy__list">
          {b.items.map((item) => (
            <li key={item}>
              <Inline text={item} />
            </li>
          ))}
        </ul>
      );
  }
}

/**
 * The data policy, from docs/data-policy.md at build time. It ships in the app, so it
 * opens offline, and the repo copy and this page can never disagree.
 */
export function DataPolicy() {
  return (
    <Screen title={title} back={{ to: "/me" }}>
      <article className="policy">
        {blocks.map((b) => (
          <Block key={b.key} block={b} />
        ))}
      </article>
    </Screen>
  );
}

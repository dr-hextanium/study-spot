import { type OverviewSection, t } from "@study-spot/ui-logic";
import { sectionName } from "../lib/format.ts";
import { Screen } from "../ui/Screen.tsx";
import { Loading, Skel, SkelRows, SkelStepBar } from "../ui/Skeleton.tsx";
import { SyncStatus } from "./SyncStatus.tsx";

/** The action bar's shape: a wide control and, unless stacked, an icon button. */
function SkelBar(props: { stacked?: boolean }) {
  return (
    <span className="skel-bar" aria-hidden="true">
      <Skel kind="control" w="100%" />
      {props.stacked === true ? <Skel kind="control" w="100%" /> : null}
    </span>
  );
}

/**
 * A spot overview whose spot is not on this phone yet: the same top bar, title,
 * meta line, step bar and groups of rows, in mist. The name is not known, so the
 * h1 says the app's name to assistive tech only.
 */
export function OverviewSkeleton() {
  return (
    <Screen
      title={t("app.name")}
      titleHidden
      back={{ to: "/survey" }}
      trailing={<SyncStatus variant="icon" />}
      action={<SkelBar />}
    >
      <Loading className="skel-screen">
        <span className="skel-title">
          <Skel kind="title" w="72%" />
        </span>
        <span className="meta">
          <Skel kind="pill" w="52px" />
          <Skel kind="pill" w="96px" />
          <Skel kind="small" w="120px" />
        </span>
        <SkelStepBar />
        <span className="progress-line">
          <Skel kind="small" w="40%" />
        </span>
        <span className="group-heading">
          <Skel kind="heading" w="48%" />
        </span>
        <SkelRows count={6} lead compact />
        <span className="group-heading">
          <Skel kind="heading" w="28%" />
        </span>
        <SkelRows count={3} lead compact />
      </Loading>
    </Screen>
  );
}

/** A section editor whose spot is not on this phone yet: the real title, then fields in mist. */
export function EditorSkeleton(props: { section: OverviewSection }) {
  return (
    <Screen
      title={sectionName(props.section)}
      back={{ to: "/survey" }}
      trailing={<SyncStatus variant="icon" />}
      stacked
      action={<SkelBar stacked />}
    >
      <Loading className="skel-screen">
        <span className="editor-meta">
          <Skel w="46%" />
          <SkelStepBar />
          <span className="progress-line">
            <Skel kind="small" w="52%" />
          </span>
        </span>
        {[0, 1, 2].map((i) => (
          <span key={i} className="field">
            <Skel w={i === 1 ? "36%" : "28%"} />
            <Skel kind="control" w={i === 0 ? "200px" : "100%"} />
          </span>
        ))}
      </Loading>
    </Screen>
  );
}

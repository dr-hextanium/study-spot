import { t } from "@perch/ui-logic";
import { useQuickPick } from "../../hooks/useQuickPick.ts";
import { Screen } from "../../ui/Screen.tsx";
import { QueryPanel } from "./QueryPanel.tsx";

const NO_CUSTOM = [] as const;

/** Student Home: the question, then the one place to go. */
export function Home() {
  const q = useQuickPick(NO_CUSTOM);
  return (
    <Screen title={t("student.home.title")}>
      {q.state === "ready" ? <QueryPanel q={q} /> : null}
    </Screen>
  );
}

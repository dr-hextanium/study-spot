import { t } from "@perch/ui-logic";
import { Screen } from "../../ui/Screen.tsx";

/** A student route's screen until its phase replaces it: the title and a loading line. */
export function Placeholder(props: { title: string }) {
  return (
    <Screen title={props.title}>
      <p className="lede" role="status">
        {t("student.data.loading")}
      </p>
    </Screen>
  );
}

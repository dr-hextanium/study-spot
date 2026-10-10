import type { BundleBuilding } from "@perch/core";
import { type BrowseView, t } from "@perch/ui-logic";

/** The Map view. A placeholder until the lazy map lands. */
export function BrowseMap(_props: { view: BrowseView; from: BundleBuilding | null }) {
  return <p className="lede">{t("student.map.loading")}</p>;
}

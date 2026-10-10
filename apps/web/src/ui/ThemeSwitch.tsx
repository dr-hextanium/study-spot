import { type ThemePref, t } from "@perch/ui-logic";
import { Segmented } from "./Segmented.tsx";
import { useThemePref } from "./themePref.ts";

const OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "light", label: t("theme.light") },
  { value: "dark", label: t("theme.dark") },
  { value: "system", label: t("theme.system") },
];

/** Light, dark, or follow the phone. Stored on this device only. */
export function ThemeSwitch() {
  const [pref, setPref] = useThemePref();
  return <Segmented label={t("theme.label")} options={OPTIONS} value={pref} onChange={setPref} />;
}

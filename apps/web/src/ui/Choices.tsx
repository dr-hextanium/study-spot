import { t } from "@study-spot/ui-logic";
import type { LucideIcon } from "lucide-react";
import { type Option, Segmented } from "./Segmented.tsx";

const UNKNOWN = "__unknown";

type TriProps = {
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  helper?: string;
  icon?: LucideIcon;
};

/** Yes, No, or Not sure for an optional fact; Not sure stores nothing. */
export function TriState({ label, value, onChange, helper, icon }: TriProps) {
  const options: Option<"yes" | "no" | typeof UNKNOWN>[] = [
    { value: "yes", label: t("common.yes") },
    { value: "no", label: t("common.no") },
    { value: UNKNOWN, label: t("common.unknown") },
  ];
  return (
    <Segmented
      label={label}
      icon={icon}
      helper={helper}
      options={options}
      value={value === null ? UNKNOWN : value ? "yes" : "no"}
      onChange={(v) => onChange(v === UNKNOWN ? null : v === "yes")}
    />
  );
}

type YesNoProps = {
  icon?: LucideIcon;
  label: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
  helper?: string;
  error?: string | undefined;
};

/** A required yes or no: no third option. */
export function YesNo({ label, value, onChange, helper, error, icon }: YesNoProps) {
  return (
    <Segmented
      label={label}
      icon={icon}
      helper={helper}
      error={error}
      options={[
        { value: "yes", label: t("common.yes") },
        { value: "no", label: t("common.no") },
      ]}
      value={value === null ? null : value ? "yes" : "no"}
      onChange={(v) => onChange(v === "yes")}
    />
  );
}

type OptionalProps<V extends string> = {
  label: string;
  options: readonly Option<V>[];
  value: V | null;
  onChange: (value: V | null) => void;
  helper?: string;
  layout?: "row" | "list";
  icon?: LucideIcon;
};

/** One of a few options, plus Not sure for an optional field. */
export function OptionalChoice<V extends string>(p: OptionalProps<V>) {
  const known = (x: V | typeof UNKNOWN): x is V => x !== UNKNOWN;
  const options: Option<V | typeof UNKNOWN>[] = [
    ...p.options,
    { value: UNKNOWN, label: t("common.unknown") },
  ];
  return (
    <Segmented<V | typeof UNKNOWN>
      label={p.label}
      icon={p.icon}
      helper={p.helper}
      layout={p.layout ?? "row"}
      options={options}
      value={p.value ?? UNKNOWN}
      onChange={(v) => p.onChange(known(v) ? v : null)}
    />
  );
}

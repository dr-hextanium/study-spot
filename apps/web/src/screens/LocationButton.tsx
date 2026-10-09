import { t } from "@study-spot/ui-logic";
import { LocateFixed } from "lucide-react";
import { useDeps } from "../app/AppProvider.tsx";
import { GOOD_FIX_METERS, type LocationState } from "../lib/location.ts";
import { Button } from "../ui/Button.tsx";
import { Icon } from "../ui/Icon.tsx";

/** Optional: fills the spot's point from the phone. The building alone is always enough. */
export function LocationButton(props: {
  state: LocationState;
  onChange: (next: LocationState) => void;
}) {
  const { geolocation } = useDeps();
  const { state } = props;
  async function locate() {
    props.onChange({ kind: "pending" });
    const fix = await geolocation.current();
    props.onChange(fix === null ? { kind: "denied" } : { kind: "fix", fix });
  }
  const meters = state.kind === "fix" ? Math.round(state.fix.accuracyMeters) : 0;
  return (
    <div className="field">
      <Button
        variant="ghost"
        icon={<Icon icon={LocateFixed} />}
        disabled={state.kind === "pending"}
        onClick={() => void locate()}
      >
        {state.kind === "pending" ? t("new.location.pending") : t("new.location.button")}
      </Button>
      <p className="field__helper" aria-live="polite">
        {state.kind === "denied"
          ? t("new.location.denied")
          : state.kind === "fix"
            ? meters <= GOOD_FIX_METERS
              ? t("new.location.done", { meters })
              : t("new.location.poor", { meters })
            : ""}
      </p>
    </div>
  );
}

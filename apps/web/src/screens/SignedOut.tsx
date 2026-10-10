import { t } from "@study-spot/ui-logic";
import { Screen } from "../ui/Screen.tsx";

/** Every survey route when this phone has no working sign-in. Queued changes are kept. */
export function SignedOut() {
  return (
    <Screen title={t("auth.expired.title")}>
      <div className="signed-out">
        <p>{t("auth.expired.body")}</p>
        <p className="lede">{t("sync.sheet.other_phone_warning")}</p>
      </div>
    </Screen>
  );
}

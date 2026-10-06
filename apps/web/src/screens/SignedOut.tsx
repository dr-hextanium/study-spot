import { t } from "@study-spot/ui-logic";
import { HeaderBand } from "../ui/HeaderBand.tsx";
import { Screen } from "../ui/Screen.tsx";

/** Every survey route when this phone has no working sign-in. Queued changes are kept. */
export function SignedOut() {
  return (
    <>
      <HeaderBand title={t("app.name")} />
      <Screen>
        <h2 className="title">{t("auth.expired.title")}</h2>
        <p>{t("auth.expired.body")}</p>
        <p className="lede">{t("sync.sheet.other_phone_warning")}</p>
      </Screen>
    </>
  );
}

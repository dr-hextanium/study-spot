import { useRegisterSW } from "virtual:pwa-register/react";
import { t } from "@perch/ui-logic";
import { RefreshCw } from "lucide-react";
import { Icon } from "../ui/Icon.tsx";

/** A new build is waiting: the surveyor chooses when to reload, so no edit is cut off. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  // The live region stays mounted, so the message is announced when it appears.
  return (
    <div aria-live="polite">
      {needRefresh ? (
        <div className="update">
          <Icon icon={RefreshCw} />
          <p className="update__text">{t("update.ready")}</p>
          <button
            type="button"
            className="update__btn"
            onClick={() => void updateServiceWorker(true)}
          >
            {t("update.reload")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

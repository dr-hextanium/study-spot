import { useRegisterSW } from "virtual:pwa-register/react";
import { t } from "@study-spot/ui-logic";
import { Banner } from "../ui/Banner.tsx";
import { Button } from "../ui/Button.tsx";

/** A new build is waiting: the surveyor chooses when to reload, so no edit is cut off. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="update">
      <Banner
        tone="note"
        action={
          <Button variant="primary" onClick={() => void updateServiceWorker(true)}>
            {t("update.reload")}
          </Button>
        }
      >
        {t("update.ready")}
      </Banner>
    </div>
  );
}

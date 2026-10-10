import {
  dismissInstall,
  type InstallState,
  readInstall,
  shouldOfferInstall,
  t,
} from "@perch/ui-logic";
import { useState, useSyncExternalStore } from "react";
import { useDeps } from "../../app/AppProvider.tsx";
import {
  installPromptAvailable,
  promptInstall,
  subscribeInstallPrompt,
} from "../../app/installPrompt.ts";
import { isIos, isStandalone } from "../../lib/platform.ts";
import { Banner } from "../../ui/Banner.tsx";
import { Button } from "../../ui/Button.tsx";
import "./install.css";

/**
 * Asks once, after two separate visits that picked a spot, to add Perch to the home
 * screen. Nothing shows in an installed app, after "No thanks", or where the browser
 * cannot be asked and is not iOS.
 */
export function InstallNote() {
  const { prefs } = useDeps();
  const [state, setState] = useState<InstallState>(() => readInstall(prefs));
  const available = useSyncExternalStore(subscribeInstallPrompt, installPromptAvailable);
  if (!shouldOfferInstall(state, isStandalone(window))) return null;
  const ios = isIos(window.navigator);
  if (!available && !ios) return null;
  const dismiss = (): void => {
    dismissInstall(prefs);
    setState({ ...state, dismissed: true });
  };
  return (
    <div className="install-note">
      <Banner
        tone="note"
        action={
          <>
            {available ? (
              <Button variant="ink" onClick={() => void promptInstall()}>
                {t("student.install.add")}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={dismiss}>
              {t("student.install.dismiss")}
            </Button>
          </>
        }
      >
        {available ? t("student.install.note") : t("student.install.ios")}
      </Banner>
    </div>
  );
}

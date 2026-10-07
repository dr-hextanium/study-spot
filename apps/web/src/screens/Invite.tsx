import { OpaqueToken } from "@study-spot/core";
import { t } from "@study-spot/ui-logic";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useDeps } from "../app/AppProvider.tsx";
import { useOnline } from "../hooks/useOnline.ts";
import { useSession } from "../hooks/useSession.ts";
import { isIos, isStandalone } from "../lib/platform.ts";
import { Banner } from "../ui/Banner.tsx";
import { Button } from "../ui/Button.tsx";
import { TextField } from "../ui/Field.tsx";
import { HeaderBand } from "../ui/HeaderBand.tsx";
import { Screen } from "../ui/Screen.tsx";

type Problem = "invalid" | "expired" | "used" | "name" | "storage" | "generic" | null;

const PROBLEM_TEXT: Record<Exclude<Problem, null>, () => string> = {
  invalid: () => t("invite.invalid"),
  expired: () => t("invite.expired"),
  used: () => t("invite.used"),
  name: () => t("invite.name.required"),
  storage: () => t("error.generic"),
  generic: () => t("error.generic"),
};

/**
 * Turns a link into a signed-in phone. Nothing happens on load: on an iPhone the
 * link must be opened inside the installed app, and accepting in Safari first
 * would use it up.
 */
export function Invite(props: { token: string; relogin: boolean }) {
  const { api } = useDeps();
  const { join } = useSession();
  const navigate = useNavigate();
  const online = useOnline();
  const tokenOk = OpaqueToken.safeParse(props.token).success;
  const [askName, setAskName] = useState(!props.relogin);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(tokenOk ? null : "invalid");
  const ios = isIos(navigator) && !isStandalone(window);

  async function accept() {
    const display = name.trim();
    if (askName && display === "") {
      setProblem("name");
      return;
    }
    setBusy(true);
    setProblem(null);
    const res = await api.acceptInvite(
      askName ? { token: props.token, display_name: display } : { token: props.token },
    );
    setBusy(false);
    switch (res.kind) {
      case "ok":
        if (!join(res.value)) return setProblem("storage");
        await navigate({ to: "/survey", replace: true });
        return;
      case "gone":
        return setProblem(
          res.code === "invite_expired"
            ? "expired"
            : res.code === "invite_used"
              ? "used"
              : "invalid",
        );
      case "invalid":
        if (res.code === "display_name_required") {
          // A new-surveyor link opened as a re-login link: ask for the name after all.
          setAskName(true);
          return setProblem("name");
        }
        return setProblem("invalid");
      default:
        return setProblem("generic");
    }
  }

  const relogin = !askName;
  const blocked = !tokenOk || problem === "expired" || problem === "used" || problem === "invalid";
  return (
    <>
      <HeaderBand title={t("app.name")} />
      <Screen
        action={
          blocked ? undefined : (
            <Button variant="primary" wide disabled={busy || !online} onClick={() => void accept()}>
              {busy ? t("invite.joining") : relogin ? t("invite.relogin.action") : t("invite.join")}
            </Button>
          )
        }
      >
        <h2 className="title">{relogin ? t("invite.relogin.title") : t("invite.title")}</h2>
        <p>{relogin ? t("invite.relogin.body") : t("invite.body")}</p>
        {ios ? (
          <section className="note" aria-labelledby="ios-note">
            <h3 className="label" id="ios-note">
              {t("invite.ios.title")}
            </h3>
            <p>{t("invite.ios.body")}</p>
          </section>
        ) : null}
        {askName && !blocked ? (
          <TextField
            label={t("invite.name.label")}
            helper={t("invite.name.helper")}
            error={problem === "name" ? PROBLEM_TEXT.name() : undefined}
            value={name}
            onChange={setName}
            autoComplete="name"
            maxLength={60}
          />
        ) : null}
        {problem !== null && problem !== "name" ? <Banner>{PROBLEM_TEXT[problem]()}</Banner> : null}
        {!online && !blocked ? <Banner tone="note">{t("invite.offline")}</Banner> : null}
      </Screen>
    </>
  );
}

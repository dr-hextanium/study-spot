import { type AcceptInviteResponse, OpaqueToken } from "@study-spot/core";
import { t } from "@study-spot/ui-logic";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useDeps } from "../app/AppProvider.tsx";
import { OWNER_KEY, QueueOwner } from "../app/deps.ts";
import { useOnline } from "../hooks/useOnline.ts";
import { useSession } from "../hooks/useSession.ts";
import { isIos, isStandalone } from "../lib/platform.ts";
import { Banner } from "../ui/Banner.tsx";
import { Button } from "../ui/Button.tsx";
import { TextField } from "../ui/Field.tsx";
import { HeaderBand } from "../ui/HeaderBand.tsx";
import { Screen } from "../ui/Screen.tsx";
import { ConfirmSheet } from "../ui/Sheet.tsx";

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
  const { api, session, outbox, cache } = useDeps();
  const { join } = useSession();
  const navigate = useNavigate();
  const online = useOnline();
  const tokenOk = OpaqueToken.safeParse(props.token).success;
  const [askName, setAskName] = useState(!props.relogin);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(tokenOk ? null : "invalid");
  /** The server accepted the link (it is spent) but a different surveyor holds this phone's queue. */
  const [held, setHeld] = useState<{ accepted: AcceptInviteResponse; owner: string } | null>(null);
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
      case "ok": {
        const owner = await otherQueueOwner(res.value);
        if (owner !== null) {
          setHeld({ accepted: res.value, owner });
          return;
        }
        return finish(res.value);
      }
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

  /**
   * The accept answer is the first place the surveyor's id shows, so this runs after the
   * server spent the link and before the session is saved: nothing is sent under the new
   * token until the user chooses. The queue's owner is the stored session, or, after a
   * sign-out, the note signOut left. Returns that owner's name when a different surveyor's
   * writes are queued, else null. An unknown queue (the read failed) counts as non-empty.
   */
  async function otherQueueOwner(accepted: AcceptInviteResponse): Promise<string | null> {
    const stored = session.current();
    let owner: { id: string; name: string } | null =
      stored === null ? null : { id: stored.surveyor.id, name: stored.surveyor.display_name };
    if (owner === null) {
      try {
        const raw = await cache.get(OWNER_KEY);
        const parsed = raw === null ? null : QueueOwner.safeParse(JSON.parse(raw));
        if (parsed?.success) owner = { id: parsed.data.id, name: parsed.data.display_name };
      } catch {
        // An unreadable note is no note.
      }
    }
    if (owner === null || owner.id === accepted.surveyor.id) return null;
    try {
      await outbox.reload();
    } catch {
      if (!outbox.getSnapshot().loaded) return owner.name;
    }
    return outbox.getSnapshot().records.length > 0 ? owner.name : null;
  }

  async function finish(accepted: AcceptInviteResponse) {
    if (!join(accepted)) return setProblem("storage");
    // The session is the owner again; the note from a sign-out is spent.
    await cache.delete(OWNER_KEY).catch(() => undefined);
    await navigate({ to: "/survey", replace: true });
  }

  async function discardAndJoin(accepted: AcceptInviteResponse) {
    setBusy(true);
    try {
      // Stop first and let a send already in flight end, so no old-token write lands after the choice.
      outbox.stop();
      await outbox.idle();
      await outbox.discardAll();
    } catch {
      outbox.resume();
      setBusy(false);
      return setProblem("generic");
    }
    setBusy(false);
    setHeld(null);
    await finish(accepted);
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
      <ConfirmSheet
        open={held !== null}
        title={t("invite.switch.title", { name: held?.owner ?? "" })}
        body={t("invite.switch.body", {
          name: held?.owner ?? "",
          new: held?.accepted.surveyor.display_name ?? "",
        })}
        action={t("invite.switch.discard")}
        cancel={t("common.cancel")}
        destructive
        onCancel={() => {
          // The link is spent and its token is dropped; the phone stays signed in as before.
          setHeld(null);
          void navigate({ to: "/survey", replace: true });
        }}
        onConfirm={() => {
          if (held !== null) void discardAndJoin(held.accepted);
        }}
      />
    </>
  );
}

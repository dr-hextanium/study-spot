import type { SurveyorRole } from "@study-spot/core";
import { publishWarningText, t } from "@study-spot/ui-logic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useRef, useState } from "react";
import { useDeps } from "../app/AppProvider.tsx";
import { keys } from "../app/keys.ts";
import { unwrap } from "../app/queries.ts";
import { adoptServerSpot } from "../app/serverCache.ts";
import { useOnline } from "../hooks/useOnline.ts";
import { usePhotoUrl } from "../hooks/usePhotoUrl.ts";
import { useCampusTz, useQueryDeps, useSpotList } from "../hooks/useQueries.ts";
import { useSession } from "../hooks/useSession.ts";
import { useToasts } from "../hooks/useToasts.tsx";
import { dateTime } from "../lib/format.ts";
import { Banner } from "../ui/Banner.tsx";
import { Button } from "../ui/Button.tsx";
import { GroupHeading, Screen } from "../ui/Screen.tsx";
import { Segmented } from "../ui/Segmented.tsx";
import { ConfirmSheet } from "../ui/Sheet.tsx";
import { StampChip } from "../ui/StampChip.tsx";
import { SurveyHeader } from "./SurveyHeader.tsx";

function Section(props: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={props.id} className="admin-section">
      <GroupHeading id={props.id}>{props.title}</GroupHeading>
      {props.children}
    </section>
  );
}

/** A link shown once after it is made, with Copy link. */
function CreatedLink(props: { url: string; note: string }) {
  const { share } = useDeps();
  const toasts = useToasts();
  return (
    <div className="created-link">
      <p className="entered created-link__url">{props.url}</p>
      <p className="field__helper">{props.note}</p>
      <Button
        onClick={async () => {
          const result = await share.share({ title: t("app.name"), url: props.url });
          // "shared" means the share sheet took it: nothing to claim about a copy.
          if (result === "copied") toasts.show(t("admin.invite.copied"));
          else if (result === "failed") toasts.show(t("admin.invite.copy_failed"));
        }}
      >
        {t("admin.invite.copy")}
      </Button>
    </div>
  );
}

function InviteSection(props: { online: boolean }) {
  const { api } = useDeps();
  const toasts = useToasts();
  const [role, setRole] = useState<SurveyorRole>("surveyor");
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  async function create() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const res = await api.createInvite({ role });
      if (res.kind === "ok") setUrl(res.value.url);
      else toasts.show(t("error.generic"));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <Section id="admin-invite" title={t("admin.invite.title")}>
      <Segmented
        label={t("admin.invite.title")}
        options={[
          { value: "surveyor", label: t("admin.invite.role.surveyor") },
          { value: "admin", label: t("admin.invite.role.admin") },
        ]}
        value={role}
        onChange={setRole}
      />
      <Button variant="primary" disabled={!props.online || busy} onClick={() => void create()}>
        {t("admin.invite.create")}
      </Button>
      {url === null ? null : <CreatedLink url={url} note={t("admin.invite.created")} />}
    </Section>
  );
}

function SurveyorsSection(props: { online: boolean }) {
  const { api } = useDeps();
  const qd = useQueryDeps();
  const qc = useQueryClient();
  const toasts = useToasts();
  const { me } = useSession();
  const surveyors = useQuery({
    queryKey: keys.surveyors,
    queryFn: async () => unwrap(await api.listSurveyors(), qd.onUnauthorized),
    enabled: props.online,
  });
  const [relogin, setRelogin] = useState<{ id: string; name: string; url: string } | null>(null);
  const [revoking, setRevoking] = useState<{ id: string; name: string } | null>(null);
  const others = (surveyors.data?.surveyors ?? []).filter((s) => s.id !== me?.id);

  const linking = useRef(false);
  const [linkBusy, setLinkBusy] = useState(false);
  async function newLink(s: { id: string; role: SurveyorRole; display_name: string }) {
    if (linking.current) return;
    linking.current = true;
    setLinkBusy(true);
    try {
      // The role is kept: an admin's sign-in link signs them in as an admin again.
      const res = await api.createInvite({ role: s.role, surveyor_id: s.id });
      if (res.kind === "ok") setRelogin({ id: s.id, name: s.display_name, url: res.value.url });
      else toasts.show(t("error.generic"));
    } finally {
      linking.current = false;
      setLinkBusy(false);
    }
  }
  async function revoke() {
    const target = revoking;
    setRevoking(null);
    if (target === null) return;
    const res = await api.revokeSurveyor(target.id);
    if (res.kind !== "ok") return toasts.show(t("error.generic"));
    // A sign-in link already shown for them would now lead nowhere.
    setRelogin((shown) => (shown?.id === target.id ? null : shown));
    toasts.show(t("admin.revoke.done", { name: target.name }));
    await qc.invalidateQueries({ queryKey: keys.surveyors });
  }
  return (
    <Section id="admin-surveyors" title={t("admin.surveyors.title")}>
      {surveyors.isPending && props.online ? <p className="empty">{t("common.loading")}</p> : null}
      {surveyors.data !== undefined && others.length === 0 ? (
        <p className="empty">{t("admin.surveyors.empty")}</p>
      ) : null}
      <ul className="ruled-list">
        {others.map((s) => (
          <li key={s.id} className="entry entry--stack">
            <span className="entry__text">
              <span className="entry__name">{s.display_name}</span>
              <span className="stamp-row">
                {s.role === "admin" ? (
                  <StampChip tone="ink">{t("admin.surveyors.admin_badge")}</StampChip>
                ) : null}
                {s.active ? null : (
                  <StampChip tone="red">{t("admin.surveyors.inactive")}</StampChip>
                )}
              </span>
            </span>
            <span className="entry__actions">
              <Button disabled={!props.online || linkBusy} onClick={() => void newLink(s)}>
                {t("admin.invite.relogin")}
              </Button>
              {s.active ? (
                <Button
                  variant="quiet"
                  disabled={!props.online}
                  onClick={() => setRevoking({ id: s.id, name: s.display_name })}
                >
                  {t("admin.revoke")}
                </Button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {relogin === null ? null : (
        <CreatedLink
          url={relogin.url}
          note={t("admin.invite.relogin.created", { name: relogin.name })}
        />
      )}
      <ConfirmSheet
        open={revoking !== null}
        title={t("admin.revoke.confirm.title", { name: revoking?.name ?? "" })}
        body={t("admin.revoke.confirm.body")}
        action={t("admin.revoke.confirm.action")}
        cancel={t("common.cancel")}
        destructive
        onCancel={() => setRevoking(null)}
        onConfirm={() => void revoke()}
      />
    </Section>
  );
}

function PublishSection(props: { online: boolean }) {
  const { api } = useDeps();
  const toasts = useToasts();
  const qd = useQueryDeps();
  const qc = useQueryClient();
  const tz = useCampusTz();
  const list = useSpotList();
  const [running, setRunning] = useState(false);
  const status = useQuery({
    queryKey: keys.publish,
    queryFn: async () => unwrap(await api.publishStatus(), qd.onUnauthorized),
    enabled: props.online,
  });
  async function publishNow() {
    setRunning(true);
    const res = await api.publishNow();
    setRunning(false);
    if (res.kind === "ok") qc.setQueryData(keys.publish, res.value);
    else toasts.show(t("error.generic"));
  }
  const s = status.data;
  return (
    <Section id="admin-publish" title={t("admin.publish.title")}>
      {s === undefined ? null : (
        <>
          <p>
            {s.last_published_at === null
              ? t("admin.publish.never")
              : t("admin.publish.last", { time: dateTime(s.last_published_at, tz) })}
          </p>
          <div className="stamp-row">
            {s.dirty ? (
              <StampChip tone="amber">{t("admin.publish.dirty")}</StampChip>
            ) : (
              <StampChip tone="green">{t("admin.publish.clean")}</StampChip>
            )}
          </div>
          {s.last_error === null ? null : (
            <Banner>{t("admin.publish.error", { reason: s.last_error })}</Banner>
          )}
          {s.warnings.length === 0 ? null : (
            <>
              <p className="label">{t("admin.publish.warnings.title")}</p>
              <ul className="ruled-list">
                {s.warnings.map((w) => (
                  <li key={w} className="entry">
                    <span className="entry__text">
                      {publishWarningText(w, list.data?.spots ?? [])}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <Button
        variant="primary"
        disabled={!props.online || running || s?.running === true}
        onClick={() => void publishNow()}
      >
        {running || s?.running === true ? t("admin.publish.running") : t("admin.publish.now")}
      </Button>
    </Section>
  );
}

function PendingPhoto(props: {
  photo: { id: string; spot_id: string; spot_name: string; uploaded_by_name: string | null };
  online: boolean;
  onReject: (id: string) => void;
  onApprove: (id: string) => void;
}) {
  const url = usePhotoUrl({ photoId: props.photo.id });
  return (
    <li className="photo">
      {url === null ? (
        <div className="photo__img photo__img--empty" />
      ) : (
        <img className="photo__img" src={url} alt="" />
      )}
      <p>
        {t("admin.photos.from", {
          spot: props.photo.spot_name,
          name: props.photo.uploaded_by_name ?? t("common.unknown"),
        })}
      </p>
      <div className="photo__actions">
        <Button
          variant="primary"
          disabled={!props.online}
          onClick={() => props.onApprove(props.photo.id)}
        >
          {t("admin.photos.approve")}
        </Button>
        <Button
          variant="danger"
          disabled={!props.online}
          onClick={() => props.onReject(props.photo.id)}
        >
          {t("admin.photos.reject")}
        </Button>
      </div>
    </li>
  );
}

function PhotosSection(props: { online: boolean }) {
  const { api, outbox } = useDeps();
  const qd = useQueryDeps();
  const qc = useQueryClient();
  const toasts = useToasts();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const pending = useQuery({
    queryKey: keys.pendingPhotos,
    queryFn: async () => unwrap(await api.pendingPhotos(), qd.onUnauthorized),
    enabled: props.online,
  });
  async function act(id: string, approve: boolean) {
    const res = approve
      ? await api.approvePhoto(id, { client_write_id: crypto.randomUUID() })
      : await api.rejectPhoto(id, { client_write_id: crypto.randomUUID() });
    if (res.kind !== "ok") return toasts.show(t("error.generic"));
    await adoptServerSpot(qc, outbox, res.value);
    if (approve) toasts.show(t("photos.approve.done"));
    await qc.invalidateQueries({ queryKey: keys.pendingPhotos });
  }
  const photos = pending.data?.photos ?? [];
  return (
    <Section id="admin-photos" title={t("admin.photos.title")}>
      {pending.data !== undefined && photos.length === 0 ? (
        <p className="empty">{t("admin.photos.empty")}</p>
      ) : null}
      <ul className="photos">
        {photos.map((p) => (
          <PendingPhoto
            key={p.id}
            photo={p}
            online={props.online}
            onApprove={(id) => void act(id, true)}
            onReject={setRejecting}
          />
        ))}
      </ul>
      <ConfirmSheet
        open={rejecting !== null}
        title={t("admin.photos.reject")}
        body={t("admin.photos.reject.confirm")}
        action={t("admin.photos.reject")}
        cancel={t("common.cancel")}
        destructive
        onCancel={() => setRejecting(null)}
        onConfirm={() => {
          const id = rejecting;
          setRejecting(null);
          if (id !== null) void act(id, false);
        }}
      />
    </Section>
  );
}

/** Running the crew and the publish pipeline. Every action here needs the server. */
export function Admin() {
  const online = useOnline();
  return (
    <>
      <SurveyHeader title={t("admin.title")} back={{ to: "/survey" }} />
      <Screen>
        {online ? null : <Banner tone="note">{t("error.network_admin")}</Banner>}
        <InviteSection online={online} />
        <PublishSection online={online} />
        <PhotosSection online={online} />
        <SurveyorsSection online={online} />
      </Screen>
    </>
  );
}

import type { SurveyPhoto } from "@study-spot/core";
import { type PendingPhoto, type SpotView, t } from "@study-spot/ui-logic";
import { Camera, ImagePlus } from "lucide-react";
import { useRef, useState } from "react";
import { useDeps } from "../../app/AppProvider.tsx";
import { applyServerSpot } from "../../app/serverCache.ts";
import { useOnline } from "../../hooks/useOnline.ts";
import { usePhotoUrl } from "../../hooks/usePhotoUrl.ts";
import { useSession } from "../../hooks/useSession.ts";
import { useToasts } from "../../hooks/useToasts.tsx";
import { shrinkPhoto } from "../../lib/photo.ts";
import { Banner } from "../../ui/Banner.tsx";
import { Button } from "../../ui/Button.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { StampChip } from "../../ui/StampChip.tsx";
import { SurveyHeader } from "../SurveyHeader.tsx";

/** Shown before the first photo of a browser session (journey B6). */
export const CHECKLIST_KEY = "survey:photo-checklist-seen";

function checklistSeen(): boolean {
  try {
    return sessionStorage.getItem(CHECKLIST_KEY) === "1";
  } catch {
    return false;
  }
}

function markChecklistSeen(): void {
  try {
    sessionStorage.setItem(CHECKLIST_KEY, "1");
  } catch {
    // Without session storage the checklist shows each time; harmless.
  }
}

const CHECKLIST = [
  "photos.checklist.landscape",
  "photos.checklist.wide",
  "photos.checklist.light",
  "photos.checklist.no_people",
  "photos.checklist.no_logos",
] as const;

function ServerPhoto(props: { photo: SurveyPhoto; view: SpotView }) {
  const { photo, view } = props;
  const { outbox, api, queryClient } = useDeps();
  const { me } = useSession();
  const online = useOnline();
  const toasts = useToasts();
  const url = usePhotoUrl({ photoId: photo.id });
  const own = me !== null && me.role !== "admin" && photo.uploaded_by === me.id;
  async function approve() {
    const res = await api.approvePhoto(photo.id, { client_write_id: crypto.randomUUID() });
    if (res.kind === "ok") {
      applyServerSpot(queryClient, res.value);
      toasts.show(t("photos.approve.done"));
    } else {
      toasts.show(t("error.generic"));
    }
  }
  async function cover() {
    const id = await outbox.enqueue(
      { kind: "photo.cover", spot_id: view.spot.id, payload: { photo_id: photo.id } },
      view.serverVersion,
    );
    toasts.track(id, { done: "editor.saved", waiting: "editor.saved_offline" });
  }
  return (
    <li className="photo">
      {url === null ? (
        <div className="photo__img photo__img--empty" />
      ) : (
        <img className="photo__img" src={url} alt="" />
      )}
      <div className="stamp-row">
        {photo.is_cover ? (
          <StampChip tone="ink" filled>
            {t("photos.is_cover")}
          </StampChip>
        ) : null}
        {photo.approved ? (
          <StampChip tone="green">{t("photos.approved")}</StampChip>
        ) : (
          <StampChip tone="amber">{t("photos.awaiting")}</StampChip>
        )}
      </div>
      <div className="photo__actions">
        {photo.is_cover ? null : <Button onClick={() => void cover()}>{t("photos.cover")}</Button>}
        {photo.approved ? null : own ? (
          <p className="field__helper">{t("photos.approve.own")}</p>
        ) : (
          <Button disabled={!online} onClick={() => void approve()}>
            {t("photos.approve")}
          </Button>
        )}
      </div>
    </li>
  );
}

function LocalPhoto(props: { photo: PendingPhoto }) {
  const url = usePhotoUrl({ clientWriteId: props.photo.client_write_id });
  return (
    <li className="photo">
      {url === null ? (
        <div className="photo__img photo__img--empty" />
      ) : (
        <img className="photo__img" src={url} alt="" />
      )}
      <div className="stamp-row">
        <StampChip tone={props.photo.state === "failed" ? "red" : "blue"}>
          {props.photo.state === "failed" ? t("spot.section.failed") : t("photos.not_synced")}
        </StampChip>
      </div>
      <p className="field__helper">{t("photos.cover.wait")}</p>
    </li>
  );
}

/**
 * Photos: take or choose one, shrunk on the phone to a JPEG of at most 1600 px
 * with no EXIF, queued with the spot's other changes. Covers are set on synced
 * photos only; approving needs a connection.
 */
export function PhotosEditor({ view }: { view: SpotView }) {
  const { outbox } = useDeps();
  const online = useOnline();
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [checklist, setChecklist] = useState(false);
  // One id per photo: picking again after a failed save reuses it, so it is queued once.
  const photoId = useRef(crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<"too_big" | "unreadable" | "save_failed" | null>(null);

  function takePhoto() {
    if (checklistSeen()) camera.current?.click();
    else setChecklist(true);
  }

  async function onFile(file: File | undefined) {
    if (file === undefined) return;
    setBusy(true);
    setProblem(null);
    const shrunk = await shrinkPhoto(file);
    setBusy(false);
    if (!shrunk.ok) return setProblem(shrunk.reason);
    try {
      await outbox.addPhoto(
        view.spot.id,
        view.serverVersion,
        shrunk.bytes,
        new Date(),
        photoId.current,
      );
      photoId.current = crypto.randomUUID();
    } catch {
      // A storage timeout does not say whether the photo landed. Reload the queue so the
      // list shows it if it did. Picking again reuses this id, so it cannot be queued twice.
      await outbox.reload().catch(() => undefined);
      const landed = outbox
        .getSnapshot()
        .records.some((r) => r.client_write_id === photoId.current);
      if (landed) photoId.current = crypto.randomUUID();
      else setProblem("save_failed");
    }
  }

  const photos = view.spot.photos;
  const pending = view.pendingPhotos;
  return (
    <>
      <SurveyHeader
        title={t("section.photos.name")}
        back={{ to: "/survey/spots/$id", params: { id: view.spot.id } }}
      />
      <Screen
        action={
          <>
            <Button
              variant="primary"
              wide
              disabled={busy}
              icon={<Camera aria-hidden="true" size={20} strokeWidth={2.25} />}
              onClick={takePhoto}
            >
              {busy ? t("photos.processing") : t("photos.take")}
            </Button>
            <Button
              wide
              disabled={busy}
              icon={<ImagePlus aria-hidden="true" size={20} strokeWidth={2.25} />}
              onClick={() => library.current?.click()}
            >
              {t("photos.choose")}
            </Button>
          </>
        }
      >
        <p className="lede spot-name">{view.spot.official_name}</p>
        {problem === null ? null : (
          <Banner>
            {problem === "too_big"
              ? t("photos.too_big")
              : problem === "save_failed"
                ? t("common.save_failed")
                : t("photos.unreadable")}
          </Banner>
        )}
        {online ? null : <p className="field__helper">{t("photos.online_only")}</p>}
        {photos.length === 0 && pending.length === 0 ? (
          <p className="empty">{t("photos.empty")}</p>
        ) : null}
        <ul className="photos">
          {pending.map((p) => (
            <LocalPhoto key={p.client_write_id} photo={p} />
          ))}
          {photos.map((p) => (
            <ServerPhoto key={p.id} photo={p} view={view} />
          ))}
        </ul>
        <input
          ref={camera}
          className="visually-hidden"
          type="file"
          accept="image/*"
          capture="environment"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            void onFile(e.currentTarget.files?.[0]);
            e.currentTarget.value = "";
          }}
        />
        <input
          ref={library}
          className="visually-hidden"
          type="file"
          accept="image/*"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="photo-library"
          onChange={(e) => {
            void onFile(e.currentTarget.files?.[0]);
            e.currentTarget.value = "";
          }}
        />
      </Screen>
      <Sheet
        open={checklist}
        title={t("photos.checklist.title")}
        onClose={() => setChecklist(false)}
        actions={
          <Button
            variant="primary"
            wide
            onClick={() => {
              markChecklistSeen();
              setChecklist(false);
              // Still inside the tap, so the browser lets the camera open.
              camera.current?.click();
            }}
          >
            {t("photos.checklist.ok")}
          </Button>
        }
      >
        <ul className="checklist">
          {CHECKLIST.map((id) => (
            <li key={id}>{t(id)}</li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}

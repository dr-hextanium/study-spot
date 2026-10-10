import { t } from "@perch/ui-logic";
import { ImageOff } from "lucide-react";
import { useState } from "react";
import { Icon } from "../../ui/Icon.tsx";

/**
 * A spot photo in its 4:3 frame. A photo that fails to load (offline and never cached) or
 * a spot with none shows a mist frame that says so, never a broken image.
 */
export function SpotPhoto(props: { photo: { url: string } | null; alt: string }) {
  // The failed address, so a different photo in the same slot gets its own try.
  const [failed, setFailed] = useState<string | null>(null);
  const url = props.photo?.url ?? null;
  if (url !== null && failed !== url) {
    return (
      <img
        className="photo__img"
        src={url}
        alt={props.alt}
        // CORS mode: the data site allows it, and the service worker then caches a 200.
        crossOrigin="anonymous"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(url)}
      />
    );
  }
  return (
    <div className="photo__img photo__img--empty">
      <Icon icon={ImageOff} size={22} />
      <p className="photo__missing">
        {url === null ? t("student.spot.photo_none") : t("student.spot.photo_unavailable")}
      </p>
    </div>
  );
}

import { PHOTO_CONTENT_TYPE } from "@study-spot/core";
import { photoKey } from "@study-spot/ui-logic";
import { useEffect, useState } from "react";
import { useDeps } from "../app/AppProvider.tsx";

/**
 * An object URL for a photo's bytes: from this phone's queue for a photo not
 * synced yet, or from the signed image route (unapproved photos have no public
 * URL, and an <img> cannot send the bearer token).
 */
export function usePhotoUrl(
  source: { photoId: string } | { clientWriteId: string },
): string | null {
  const { blobs, session, apiBaseUrl } = useDeps();
  const [url, setUrl] = useState<string | null>(null);
  const key = "photoId" in source ? `server:${source.photoId}` : `local:${source.clientWriteId}`;
  useEffect(() => {
    // The previous photo's URL is revoked by the old cleanup; never show it.
    setUrl(null);
    let live = true;
    let made: string | null = null;
    const load = async (): Promise<Uint8Array | null> => {
      if (key.startsWith("local:")) return blobs.get(photoKey(key.slice("local:".length)));
      const token = session.token();
      if (token === null) return null;
      const res = await fetch(
        `${apiBaseUrl}/survey/photos/${encodeURIComponent(key.slice("server:".length))}/image`,
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );
      return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    };
    load()
      .then((bytes) => {
        if (!live || bytes === null) return;
        made = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: PHOTO_CONTENT_TYPE }));
        setUrl(made);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      if (made !== null) URL.revokeObjectURL(made);
    };
  }, [key, blobs, session, apiBaseUrl]);
  return url;
}

import { PHOTO_CONTENT_TYPE } from "@study-spot/core";
import { photoKey } from "@study-spot/ui-logic";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useDeps } from "../app/AppProvider.tsx";

/**
 * An object URL for a photo's bytes: from this phone's queue for a photo not
 * synced yet, or from the signed image route (unapproved photos have no public
 * URL, and an <img> cannot send the bearer token). Server bytes are cached by photo
 * id, so a list that remounts (a filter, a search) does not fetch them again.
 */
export function usePhotoUrl(source: { photoId: string } | { clientWriteId: string }): {
  url: string | null;
  missing: boolean;
} {
  const { blobs, session, apiBaseUrl } = useDeps();
  const [url, setUrl] = useState<string | null>(null);
  const serverId = "photoId" in source ? source.photoId : null;
  const localId = "clientWriteId" in source ? source.clientWriteId : null;
  const server = useQuery({
    queryKey: ["photo-bytes", serverId],
    enabled: serverId !== null,
    // A photo's bytes never change under its id. A failure is thrown, so it is not cached as data.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 10 * 60_000,
    retry: false,
    queryFn: async (): Promise<Uint8Array> => {
      const token = session.token();
      if (token === null || serverId === null) throw new Error("no photo");
      const res = await fetch(`${apiBaseUrl}/survey/photos/${encodeURIComponent(serverId)}/image`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`photo ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },
  });
  // True once the bytes were asked for and none came: not found, refused, or offline.
  const [localMissing, setLocalMissing] = useState(false);
  const [localBytes, setLocalBytes] = useState<Uint8Array | null>(null);
  useEffect(() => {
    setLocalBytes(null);
    setLocalMissing(false);
    if (localId === null) return;
    let live = true;
    blobs
      .get(photoKey(localId))
      .then((bytes) => {
        if (!live) return;
        if (bytes === null) setLocalMissing(true);
        else setLocalBytes(bytes);
      })
      .catch(() => {
        if (live) setLocalMissing(true);
      });
    return () => {
      live = false;
    };
  }, [localId, blobs]);
  const bytes = serverId === null ? localBytes : (server.data ?? null);
  useEffect(() => {
    // The previous photo's URL is revoked by the old cleanup; never show it.
    setUrl(null);
    if (bytes === null) return;
    const made = URL.createObjectURL(
      new Blob([new Uint8Array(bytes)], { type: PHOTO_CONTENT_TYPE }),
    );
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [bytes]);
  const missing = serverId === null ? localMissing : server.isError;
  return { url, missing };
}

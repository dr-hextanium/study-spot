import { useNearViewport } from "../hooks/useNearViewport.ts";
import { usePhotoUrl } from "../hooks/usePhotoUrl.ts";

function Loaded(props: { photoId: string; size: "row" | "card" }) {
  const { url } = usePhotoUrl({ photoId: props.photoId });
  // Nothing while loading, offline, or missing: the row reads as text only.
  if (url === null) return null;
  return <img className={`thumb thumb--${props.size}`} src={url} alt="" />;
}

/** A spot's approved cover, fetched only once the row is near the screen. Decorative: the name is the label. */
export function CoverThumb(props: { photoId: string; size: "row" | "card" }) {
  const { ref, near } = useNearViewport<HTMLSpanElement>();
  return (
    <span ref={ref} className="thumb-slot">
      {near ? <Loaded photoId={props.photoId} size={props.size} /> : null}
    </span>
  );
}

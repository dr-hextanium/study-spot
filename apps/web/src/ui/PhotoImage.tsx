import { t } from "@study-spot/ui-logic";

/**
 * A photo at its fixed 4:3 frame. While the bytes load the frame is blank; if
 * none came, it says so rather than leaving an empty box.
 */
export function PhotoImage(props: {
  source: { url: string | null; missing: boolean };
  alt: string;
}) {
  const { url, missing } = props.source;
  if (url !== null) return <img className="photo__img" src={url} alt={props.alt} />;
  return (
    <div className="photo__img photo__img--empty">
      {missing ? <p className="photo__missing">{t("photos.unavailable")}</p> : null}
    </div>
  );
}

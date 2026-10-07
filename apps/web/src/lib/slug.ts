const MAX = 80;

/** Lowercase words joined by single dashes, at most 80 characters (the core Slug rule). */
export function slugify(text: string): string {
  const words = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (words.length <= MAX) return words;
  const cut = words.slice(0, MAX);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > 0 ? cut.slice(0, lastDash) : cut).replace(/-+$/, "");
}

/** A new spot's slug: its name and building, so two "Reading Room"s in different buildings differ. */
export function spotSlug(officialName: string, buildingId: string): string {
  return slugify(`${officialName} ${buildingId}`);
}

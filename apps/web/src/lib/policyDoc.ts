type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** One block of the plain markdown the data policy is written in. */
export type DocBlock = { key: string } & (
  | { kind: "title"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
);

/** A run of text, or an address to link. The key is its place in the text. */
export type DocSpan = { key: string } & (
  | { kind: "text"; text: string }
  | { kind: "link"; href: string }
);

/**
 * Reads the small subset of markdown docs/data-policy.md uses: "# " title, "## " headings,
 * "- " bullets and paragraphs. Anything else is kept as plain text.
 */
export function parseDoc(source: string): DocBlock[] {
  const blocks: DocBlock[] = [];
  const push = (b: DistributiveOmit<DocBlock, "key">): void => {
    blocks.push({ ...b, key: `b${blocks.length}` });
  };
  let paragraph: string[] = [];
  let list: string[] | null = null;
  const flush = (): void => {
    if (paragraph.length > 0) push({ kind: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
    if (list !== null) push({ kind: "list", items: list });
    list = null;
  };
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (line === "") {
      flush();
    } else if (line.startsWith("# ")) {
      flush();
      push({ kind: "title", text: line.slice(2) });
    } else if (line.startsWith("## ")) {
      flush();
      push({ kind: "heading", text: line.slice(3) });
    } else if (line.startsWith("- ")) {
      if (paragraph.length > 0) flush();
      list ??= [];
      list.push(line.slice(2));
    } else if (list !== null) {
      const last = list.length - 1;
      list[last] = `${list[last] ?? ""} ${line}`;
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

const URL_RE = /(https:\/\/[^\s)]+[^\s).,])/;

/** Splits text so bare https addresses can be links. */
export function spans(text: string): DocSpan[] {
  return text
    .split(URL_RE)
    .filter((part) => part !== "")
    .map(
      (part, i): DocSpan =>
        URL_RE.test(part)
          ? { key: `s${i}`, kind: "link", href: part }
          : { key: `s${i}`, kind: "text", text: part },
    );
}

/** One row of a copy deck table: `| id | text | max chars | notes |`. */
export type CopyRow = { id: string; text: string; max: number };

const ROW = /^\| ([a-z0-9_.]+) \| (.*) \| (\d+) \| .*\|$/;

/** Every copy row in docs/design/surveyor-copy.md, in deck order. */
export function parseCopyDeck(markdown: string): CopyRow[] {
  const rows: CopyRow[] = [];
  for (const line of markdown.split("\n")) {
    const m = ROW.exec(line);
    if (m?.[1] !== undefined && m[2] !== undefined && m[3] !== undefined) {
      rows.push({ id: m[1], text: m[2], max: Number(m[3]) });
    }
  }
  return rows;
}

/** The source of packages/ui-logic/src/copy/copy.gen.ts. */
export function renderCopyModule(rows: readonly CopyRow[]): string {
  const text = rows.map((r) => `  ${JSON.stringify(r.id)}: ${JSON.stringify(r.text)},`);
  const max = rows.map((r) => `  ${JSON.stringify(r.id)}: ${r.max},`);
  return [
    "// Generated from docs/design/surveyor-copy.md by `bun run copy:gen`, which",
    "// then formats it with Biome so lint stays clean. Do not edit.",
    "",
    "export const COPY = {",
    ...text,
    "} as const;",
    "",
    "export const COPY_MAX = {",
    ...max,
    "} as const satisfies Record<keyof typeof COPY, number>;",
    "",
  ].join("\n");
}

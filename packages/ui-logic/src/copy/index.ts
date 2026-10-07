import { COPY } from "./copy.gen.ts";

export { COPY, COPY_MAX } from "./copy.gen.ts";

export type CopyId = keyof typeof COPY;

/** The `{name}` placeholders in a copy string, as a union of names. */
type ParamsOf<S extends string> = S extends `${string}{${infer P}}${infer Rest}`
  ? P | ParamsOf<Rest>
  : never;
export type CopyParam<K extends CopyId> = ParamsOf<(typeof COPY)[K]>;
export type CopyParams<K extends CopyId> = Record<CopyParam<K>, string | number>;

/**
 * Renders a copy string. Strings with placeholders require exactly their params:
 * t("sync.pending", { count: 3 }); t("common.save").
 */
export function t<K extends CopyId>(
  id: K,
  ...args: CopyParam<K> extends never ? [] : [CopyParams<K>]
): string {
  const text: string = COPY[id];
  const params: Readonly<Record<string, string | number>> = args[0] ?? {};
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/** Ids whose text has no placeholders. */
export type PlainCopyId = { [K in CopyId]: [CopyParam<K>] extends [never] ? K : never }[CopyId];
/** Ids whose only placeholder is {count}. */
export type CountCopyId = {
  [K in CopyId]: [CopyParam<K>] extends ["count"] ? K : never;
}[CopyId];

/**
 * A counted message: the singular id for exactly 1, else the plural id with
 * {count}. Both are whole messages from the deck, never stitched together.
 */
export function plural(count: number, one: PlainCopyId, many: CountCopyId): string {
  if (count === 1) return COPY[one];
  return COPY[many].replace("{count}", String(count));
}

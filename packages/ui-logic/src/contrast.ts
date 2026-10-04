function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new RangeError(`expected #rrggbb, got ${hex}`);
  const [, r = "00", g = "00", b = "00"] = match;
  return (
    0.2126 * channel(Number.parseInt(r, 16)) +
    0.7152 * channel(Number.parseInt(g, 16)) +
    0.0722 * channel(Number.parseInt(b, 16))
  );
}

/** WCAG 2 contrast ratio between two #rrggbb colors, from 1 to 21. */
export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

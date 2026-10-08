import { z } from "zod";

export const THEME_PREF = ["light", "dark", "system"] as const;
export const ThemePref = z.enum(THEME_PREF);
export type ThemePref = z.infer<typeof ThemePref>;

/** Where the pref lives on this device. The inline boot script in apps/web/index.html uses the same key. */
export const THEME_STORAGE_KEY = "perch.theme";

/** Storage is a trust boundary: anything that is not a known pref reads as the default, light. */
export function readThemePref(raw: unknown): ThemePref {
  const parsed = ThemePref.safeParse(raw);
  return parsed.success ? parsed.data : "light";
}

export function resolveScheme(pref: ThemePref, systemDark: boolean): "light" | "dark" {
  if (pref === "system") return systemDark ? "dark" : "light";
  return pref;
}

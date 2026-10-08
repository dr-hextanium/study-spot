import {
  readThemePref,
  resolveScheme,
  THEME_STORAGE_KEY,
  type ThemePref,
  tokens,
} from "@study-spot/ui-logic";
import { useSyncExternalStore } from "react";

const DARK = "(prefers-color-scheme: dark)";
const listeners = new Set<() => void>();

function systemIsDark(): boolean {
  return typeof matchMedia === "function" && matchMedia(DARK).matches;
}

/** Same rules as the boot script in index.html (tested against it). */
export function applyThemePref(
  pref: ThemePref,
  doc: Document = document,
  systemDark: boolean = systemIsDark(),
): void {
  const root = doc.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
  doc
    .querySelector('meta[name="color-scheme"]')
    ?.setAttribute("content", pref === "system" ? "light dark" : pref);
  const scheme = resolveScheme(pref, systemDark);
  doc
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", tokens.color[scheme].paper);
}

export function currentThemePref(): ThemePref {
  try {
    return readThemePref(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "light";
  }
}

export function storeThemePref(pref: ThemePref): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Private mode or blocked storage: the switch still applies for this visit.
  }
  applyThemePref(pref);
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * Registers the OS color-scheme listener once, from main.tsx. While the pref is
 * "system" the theme-color meta follows the OS, with or without a ThemeSwitch mounted.
 */
export function watchSystemTheme(): () => void {
  if (typeof matchMedia !== "function") return () => undefined;
  const mq = matchMedia(DARK);
  const sync = () => {
    if (currentThemePref() === "system") applyThemePref("system", document, mq.matches);
  };
  mq.addEventListener("change", sync);
  return () => mq.removeEventListener("change", sync);
}

/** The device's theme pref and a setter. */
export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const pref = useSyncExternalStore(subscribe, currentThemePref, () => "light" as const);
  return [pref, storeThemePref];
}

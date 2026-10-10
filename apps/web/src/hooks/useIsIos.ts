import { isIos } from "../lib/platform.ts";

/** Whether this phone opens Apple Maps for directions. Read once: a phone does not change. */
export function useIsIos(): boolean {
  return typeof navigator !== "undefined" && isIos(navigator);
}

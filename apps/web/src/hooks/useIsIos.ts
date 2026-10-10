import { isIos } from "../lib/platform.ts";

/**
 * Whether this is an iPhone or iPad: Apple Maps for directions, the Share-sheet install
 * steps. The one way screens ask; `isIos` in lib/platform is its testable core.
 */
export function useIsIos(): boolean {
  return typeof navigator !== "undefined" && isIos(navigator);
}

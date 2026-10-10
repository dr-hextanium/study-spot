import { z } from "zod";
import type { KeyValueStorage } from "../adapters.ts";

/** Reports that this phone chose a spot. Fire and forget: never throws, never waits. */
export type PickPing = (spotId: string) => void;

/** Tab-session key holding the spot ids already reported from this tab. */
export const PINGED_KEY = "student:pinged";
const MAX_REMEMBERED = 50;

const Pinged = z.array(z.string());

/**
 * The pick ping. Sends `{ spot_id }` and nothing else (no device id, no location, no time),
 * at most once per spot per tab session. Off unless `enabled`. Every failure is swallowed:
 * a ping must never break a screen.
 */
export function createPickPing(
  deps: { send(url: string, body: string): void; tab: KeyValueStorage; enabled: boolean },
  apiBaseUrl: string,
): PickPing {
  if (!deps.enabled) return () => {};
  const url = `${apiBaseUrl}/ping/pick`;

  function remembered(): string[] {
    try {
      const raw = deps.tab.getItem(PINGED_KEY);
      if (raw === null) return [];
      const parsed = Pinged.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : [];
    } catch {
      return [];
    }
  }

  return (spotId) => {
    try {
      const seen = remembered();
      if (seen.includes(spotId)) return;
      const next = [...seen, spotId].slice(-MAX_REMEMBERED);
      try {
        deps.tab.setItem(PINGED_KEY, JSON.stringify(next));
      } catch {
        // Without the note the spot may be sent again later; that is only a double count.
      }
      deps.send(url, JSON.stringify({ spot_id: spotId }));
    } catch {
      // Fire and forget.
    }
  };
}

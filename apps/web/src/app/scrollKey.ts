import type { ParsedLocation } from "@tanstack/react-router";

// /survey and /survey/spots/<id>, but not /survey/spots/new.
const RESTORES_BY_PATH = /^\/survey(?:\/spots\/(?!new\/?$)[^/]+)?\/?$/;

/**
 * Home and the spot overview come back where they were, even when reached by a
 * push (Back link, Save); every other screen opens at the top.
 */
export function scrollKey(location: ParsedLocation): string {
  // The router's own default key (it is not exported from @tanstack/react-router).
  return RESTORES_BY_PATH.test(location.pathname)
    ? location.pathname
    : String(location.state.__TSR_key || location.href);
}

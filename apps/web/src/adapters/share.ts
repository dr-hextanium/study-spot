import type { Share } from "@perch/ui-logic";

/** A DOMException from another realm is not `instanceof Error`, so the name is what counts. */
function isAbort(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
  );
}

/**
 * Student sharing: the share sheet first, then copying the link. This is the reverse of
 * the surveyor `createShare`, which copies first. Cancelling the sheet (an AbortError) is
 * not a failure: it resolves "shared", so no toast says anything about it.
 */
export function createWebShare(nav: Navigator = navigator): Share {
  return {
    async share(data) {
      if (typeof nav.share === "function") {
        try {
          await nav.share(data);
          return "shared";
        } catch (error) {
          if (isAbort(error)) return "shared";
          // The sheet is blocked or unsupported for this data; fall back to the link.
        }
      }
      try {
        await nav.clipboard.writeText(data.url);
        return "copied";
      } catch {
        return "failed";
      }
    },
  };
}

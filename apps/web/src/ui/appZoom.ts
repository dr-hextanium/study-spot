/**
 * The installed app feels like an app: no pinch or double-tap zoom. Only when
 * it runs standalone (added to the home screen); a browser tab keeps zoom, so
 * anyone who needs to magnify can still open Perch there.
 */
export function lockZoomWhenInstalled(win: Window = window): boolean {
  const nav = win.navigator as Navigator & { standalone?: boolean };
  const standalone =
    win.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
  if (!standalone) return false;
  const meta = win.document.querySelector('meta[name="viewport"]');
  meta?.setAttribute(
    "content",
    "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no",
  );
  // iOS ignores user-scalable, so stop the pinch gesture itself.
  const stop = (e: Event) => e.preventDefault();
  win.document.addEventListener("gesturestart", stop, { passive: false });
  win.document.addEventListener("gesturechange", stop, { passive: false });
  return true;
}

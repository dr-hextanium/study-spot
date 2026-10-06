/** iPhone or iPad, including iPadOS, which reports itself as a Mac with touch. */
export function isIos(nav: Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints">): boolean {
  return (
    /iPad|iPhone|iPod/.test(nav.userAgent) ||
    (nav.platform === "MacIntel" && nav.maxTouchPoints > 1)
  );
}

/** Running as the installed home-screen app rather than in a browser tab. */
export function isStandalone(win: Window): boolean {
  // navigator.standalone exists only in iOS Safari and is missing from lib.dom.
  const legacy = (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return legacy || win.matchMedia("(display-mode: standalone)").matches;
}

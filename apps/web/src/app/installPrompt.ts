/** The browser's deferred install prompt (Chrome, Edge, Android). iOS Safari never fires it. */
type InstallEvent = Event & { prompt(): Promise<void> };

let held: InstallEvent | null = null;
const listeners = new Set<() => void>();

function changed(): void {
  for (const l of listeners) l();
}

function isInstallEvent(e: Event): e is InstallEvent {
  return "prompt" in e && typeof e.prompt === "function";
}

/** Keeps `beforeinstallprompt` for later, so Home can offer it at a calm moment. */
export function captureInstallPrompt(win: Window): void {
  win.addEventListener("beforeinstallprompt", (e) => {
    if (!isInstallEvent(e)) return;
    e.preventDefault();
    held = e;
    changed();
  });
  // Installed from anywhere (the prompt, the browser menu): the held event is spent.
  win.addEventListener("appinstalled", () => {
    held = null;
    changed();
  });
}

export function installPromptAvailable(): boolean {
  return held !== null;
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Shows the browser's install dialog. An event can be used once, so it is dropped either way. */
export async function promptInstall(): Promise<void> {
  const event = held;
  if (event === null) return;
  held = null;
  changed();
  try {
    await event.prompt();
  } catch {
    // The dialog could not open; the note is gone and the browser menu still works.
  }
}

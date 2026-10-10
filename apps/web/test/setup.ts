import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom has <dialog> but not its modal methods; this is enough for the Sheet's open state.
if (typeof HTMLDialogElement !== "undefined" && !("showModal" in HTMLDialogElement.prototype)) {
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
    close(this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
}

afterEach(() => {
  cleanup();
  // Node 24 (CI) has no sessionStorage outside jsdom; node-environment tests skip it.
  if (typeof sessionStorage !== "undefined") sessionStorage.clear();
});

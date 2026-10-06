import { type PlainCopyId, t } from "@study-spot/ui-logic";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useDeps } from "../app/AppProvider.tsx";
import { Toast } from "../ui/Toast.tsx";

/** How long a success toast waits for the server before saying the change is on the phone. */
export const SETTLE_WAIT_MS = 3_000;
export const TOAST_MS = 4_000;

type Tracked = { id: string; done: PlainCopyId; waiting: PlainCopyId; since: number };
export type ToastApi = {
  show(text: string): void;
  /**
   * Toasts when a queued write settles: `done` once it leaves the queue (the
   * server applied it, decision 18), `waiting` if it is still on the phone
   * after SETTLE_WAIT_MS or the phone is offline. A write that fails or
   * conflicts gets no success toast; the header and banner say so.
   */
  track(clientWriteId: string, copy: { done: PlainCopyId; waiting: PlainCopyId }): void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider(props: { children: ReactNode }) {
  const { outbox, network, clock } = useDeps();
  const [message, setMessage] = useState<{ text: string; key: number } | null>(null);
  const tracked = useRef<Tracked[]>([]);
  const counter = useRef(0);

  const show = useCallback((text: string) => {
    counter.current += 1;
    setMessage({ text, key: counter.current });
  }, []);

  useEffect(() => {
    if (message === null) return;
    const timer = setTimeout(() => setMessage(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    const check = () => {
      const records = outbox.getSnapshot().records;
      const now = clock.now().getTime();
      const left: Tracked[] = [];
      for (const w of tracked.current) {
        const r = records.find((x) => x.client_write_id === w.id);
        if (r === undefined) show(t(w.done));
        else if (r.state === "failed" || r.state === "conflict") continue;
        else if (now - w.since >= SETTLE_WAIT_MS || !network.online()) show(t(w.waiting));
        else left.push(w);
      }
      tracked.current = left;
    };
    const stop = outbox.subscribe(check);
    const timer = setInterval(check, 500);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [outbox, network, clock, show]);

  const api: ToastApi = {
    show,
    track(id, copy) {
      if (!network.online()) {
        show(t(copy.waiting));
        return;
      }
      tracked.current = [...tracked.current, { id, ...copy, since: clock.now().getTime() }];
    },
  };
  return (
    <ToastContext.Provider value={api}>
      {props.children}
      <Toast message={message} onDismiss={() => setMessage(null)} />
    </ToastContext.Provider>
  );
}

export function useToasts(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) throw new Error("useToasts outside ToastProvider");
  return api;
}

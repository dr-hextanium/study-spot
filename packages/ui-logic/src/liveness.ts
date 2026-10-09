import type { Ids, Liveness, QueueSignal } from "./adapters.ts";

type Registry = { held: Set<string>; signals: Set<() => void> };
const registries = new WeakMap<object, Registry>();

function registry(scope: object): Registry {
  let r = registries.get(scope);
  if (r === undefined) {
    r = { held: new Set(), signals: new Set() };
    registries.set(scope, r);
  }
  return r;
}

/**
 * In-process Liveness for contexts sharing one storage object, `scope` (the
 * outbox passes its cache). An owner is alive while it holds. Owners written
 * by an earlier process were never held here, so they read as gone. The owner
 * id is a uuid from `ids`: a counter would name the first instance of every
 * tab alike, and two tabs would then treat each other's in-flight writes as
 * their own. (`ids` is injected so this package stays free of browser APIs.)
 */
export function createLocalLiveness(scope: object, ids: Ids): Liveness {
  const r = registry(scope);
  const self = ids.uuid();
  return {
    hold: async () => {
      r.held.add(self);
      return self;
    },
    release: () => {
      r.held.delete(self);
    },
    alive: async (owner) => r.held.has(owner),
  };
}

/** In-process QueueSignal for contexts sharing one storage object, `scope`. */
export function createLocalSignal(scope: object): QueueSignal {
  const r = registry(scope);
  const listeners = new Set<() => void>();
  const deliver = () => {
    for (const l of listeners) l();
  };
  r.signals.add(deliver);
  return {
    post: () => {
      for (const d of r.signals) if (d !== deliver) d();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

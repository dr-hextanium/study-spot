import type { Lock } from "./adapters.ts";

/**
 * In-process Lock: holders of one name run one at a time, in call order, and a
 * holder that throws still releases. It does not exclude other tabs.
 */
export function createLocalLock(): Lock {
  const tails = new Map<string, Promise<void>>();
  return {
    run<T>(name: string, fn: () => Promise<T>): Promise<T> {
      const result = (tails.get(name) ?? Promise.resolve()).then(fn);
      const tail = result.then(
        () => undefined,
        () => undefined,
      );
      tails.set(name, tail);
      void tail.then(() => {
        if (tails.get(name) === tail) tails.delete(name);
      });
      return result;
    },
  };
}

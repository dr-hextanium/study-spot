/** Stand-in for vite-plugin-pwa's virtual module under Vitest: no update is ever waiting. */
export function useRegisterSW() {
  return {
    needRefresh: [false, () => {}] as const,
    offlineReady: [false, () => {}] as const,
    updateServiceWorker: async (_reload?: boolean) => {},
  };
}

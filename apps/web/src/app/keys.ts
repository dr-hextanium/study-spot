/** TanStack Query keys. Survey keys are persisted to IndexedDB; admin keys never are. */
export const keys = {
  list: ["survey", "spots"] as const,
  spot: (id: string) => ["survey", "spot", id] as const,
  spotPrefix: ["survey", "spot"] as const,
  campus: ["survey", "campus"] as const,
  surveyors: ["admin", "surveyors"] as const,
  publish: ["admin", "publish"] as const,
  pendingPhotos: ["admin", "photos"] as const,
};

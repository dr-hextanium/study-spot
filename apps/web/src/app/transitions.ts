/**
 * Router view transitions (styles.css, "Route transitions"). A change of screen is
 * typed "route" and cross-fades; a change of search only (a sheet opening from
 * ?write=) is not typed, so it swaps at once. Shared by the app and its tests.
 */
export const defaultViewTransition = {
  types: ({ pathChanged }: { pathChanged: boolean }): string[] | false =>
    pathChanged ? ["route"] : false,
};

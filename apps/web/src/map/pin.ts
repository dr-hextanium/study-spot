import type { Fullness } from "@perch/core";

/** One spot on the map. `label` is the pin's accessible name and always says typical, estimate or no data. */
export type Pin = {
  id: string;
  slug: string;
  lat: number;
  lng: number;
  bucket: Fullness | "none";
  label: string;
};

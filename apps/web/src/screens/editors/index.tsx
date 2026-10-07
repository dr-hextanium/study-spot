import type { OverviewSection, SpotView } from "@study-spot/ui-logic";
import type { ReactElement } from "react";
import { EstimatesEditor } from "./EstimatesEditor.tsx";
import { HoursEditor } from "./HoursEditor.tsx";
import { IdentityEditor } from "./IdentityEditor.tsx";
import { PhotosEditor } from "./PhotosEditor.tsx";
import {
  AccessEditor,
  AccessibilityEditor,
  AmenitiesEditor,
  EnvironmentEditor,
  LateNightEditor,
  PowerEditor,
  SeatingEditor,
  UseFitEditor,
} from "./simple.tsx";

/** One editor per overview row; the route renders the one its $section names. */
export const EDITORS: Readonly<
  Record<OverviewSection, (props: { view: SpotView }) => ReactElement>
> = {
  identity: IdentityEditor,
  access: AccessEditor,
  hours: HoursEditor,
  seating: SeatingEditor,
  power: PowerEditor,
  environment: EnvironmentEditor,
  use_fit: UseFitEditor,
  amenities: AmenitiesEditor,
  accessibility: AccessibilityEditor,
  late_night: LateNightEditor,
  estimates: EstimatesEditor,
  photos: PhotosEditor,
};

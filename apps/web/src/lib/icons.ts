import type { OverviewSection } from "@study-spot/ui-logic";
import {
  Accessibility,
  Armchair,
  Camera,
  ChartColumn,
  Clock,
  Coffee,
  DoorOpen,
  type LucideIcon,
  MapPin,
  Moon,
  Plug,
  Utensils,
  Volume2,
} from "lucide-react";

/** One icon per overview section, used on rows, editor labels and the Actions sheet. */
export const SECTION_ICON: Record<OverviewSection, LucideIcon> = {
  identity: MapPin,
  access: DoorOpen,
  seating: Armchair,
  power: Plug,
  environment: Volume2,
  use_fit: Utensils,
  hours: Clock,
  amenities: Coffee,
  accessibility: Accessibility,
  late_night: Moon,
  estimates: ChartColumn,
  photos: Camera,
};

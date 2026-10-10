import type { Amenity, SeatType, TableConfig } from "@perch/core";
import type { OverviewSection } from "@perch/ui-logic";
import {
  Accessibility,
  Armchair,
  Bath,
  Camera,
  ChartColumn,
  Clock,
  Coffee,
  Columns2,
  DoorOpen,
  GlassWater,
  LampDesk,
  type LucideIcon,
  MapPin,
  Microwave,
  Moon,
  PersonStanding,
  Pizza,
  Plug,
  Printer,
  Sofa,
  User,
  Users,
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

/** One icon per kind of seat, on the Seating tags. */
export const SEAT_TYPE_ICON: Record<SeatType, LucideIcon> = {
  table_chair: Armchair,
  carrel: LampDesk,
  soft: Sofa,
  booth: Columns2,
  standing: PersonStanding,
};

/** One icon per table layout, on the Seating tags. */
export const TABLE_ICON: Record<TableConfig, LucideIcon> = {
  large_shared: Users,
  small_2_4: Users,
  individual: User,
};

/** One icon per nearby amenity, on the Amenities rows. */
export const AMENITY_ICON: Record<Amenity, LucideIcon> = {
  bathroom: Bath,
  water: GlassWater,
  coffee_food: Coffee,
  printer: Printer,
  microwave: Microwave,
  late_food: Pizza,
};

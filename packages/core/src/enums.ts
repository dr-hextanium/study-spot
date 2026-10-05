import { z } from "zod";

export const ELIGIBILITY = [
  "all_students",
  "residents_building",
  "residents_quad",
  "grad_only",
  "department",
  "public",
] as const;
export const Eligibility = z.enum(ELIGIBILITY);
export type Eligibility = z.infer<typeof Eligibility>;

export const ENTRY_METHOD = ["open", "card_swipe", "staffed_desk"] as const;
export const EntryMethod = z.enum(ENTRY_METHOD);
export type EntryMethod = z.infer<typeof EntryMethod>;

export const SEAT_TYPE = ["table_chair", "carrel", "soft", "booth", "standing"] as const;
export const SeatType = z.enum(SEAT_TYPE);
export type SeatType = z.infer<typeof SeatType>;

export const TABLE_CONFIG = ["large_shared", "small_2_4", "individual"] as const;
export const TableConfig = z.enum(TABLE_CONFIG);
export type TableConfig = z.infer<typeof TableConfig>;

export const CELL_SIGNAL = ["poor", "ok", "good"] as const;
export const CellSignal = z.enum(CELL_SIGNAL);
export type CellSignal = z.infer<typeof CellSignal>;

export const NOISE_POLICY = ["silent", "quiet", "conversational", "group_friendly"] as const;
export const NoisePolicy = z.enum(NOISE_POLICY);
export type NoisePolicy = z.infer<typeof NoisePolicy>;

export const NOISE_BUCKET = ["silent", "quiet", "conversational", "loud"] as const;
export const NoiseBucket = z.enum(NOISE_BUCKET);
export type NoiseBucket = z.infer<typeof NoiseBucket>;

export const LIGHTING = ["dim", "moderate", "bright"] as const;
export const Lighting = z.enum(LIGHTING);
export type Lighting = z.infer<typeof Lighting>;

export const TEMPERATURE = ["cold", "neutral", "warm"] as const;
export const Temperature = z.enum(TEMPERATURE);
export type Temperature = z.infer<typeof Temperature>;

export const CALLS_OK = ["not_allowed", "allowed_impractical", "allowed"] as const;
export const CallsOk = z.enum(CALLS_OK);
export type CallsOk = z.infer<typeof CallsOk>;

export const FOOD_POLICY = ["none", "covered_drinks", "food_ok"] as const;
export const FoodPolicy = z.enum(FOOD_POLICY);
export type FoodPolicy = z.infer<typeof FoodPolicy>;

export const AMENITY = [
  "bathroom",
  "water",
  "coffee_food",
  "printer",
  "microwave",
  "late_food",
] as const;
export const Amenity = z.enum(AMENITY);
export type Amenity = z.infer<typeof Amenity>;

export const ATTRIBUTE_GROUP = [
  "identity",
  "access",
  "hours",
  "seating",
  "power",
  "environment",
  "use_fit",
  "amenities",
  "accessibility",
  "late_night",
] as const;
export const AttributeGroup = z.enum(ATTRIBUTE_GROUP);
export type AttributeGroup = z.infer<typeof AttributeGroup>;

export const VERIFICATION_SOURCE = ["survey", "official", "user"] as const;
export const VerificationSource = z.enum(VERIFICATION_SOURCE);
export type VerificationSource = z.infer<typeof VerificationSource>;

export const CONFIDENCE = ["measured", "estimated", "reported"] as const;
export const Confidence = z.enum(CONFIDENCE);
export type Confidence = z.infer<typeof Confidence>;

export const FULLNESS = ["empty", "some", "filling", "nearly_full", "full"] as const;
export const Fullness = z.enum(FULLNESS);
export type Fullness = z.infer<typeof Fullness>;

export const FULLNESS_RATIO: Readonly<Record<Fullness, number>> = {
  empty: 0.1,
  some: 0.35,
  filling: 0.6,
  nearly_full: 0.85,
  full: 1.0,
};

export const DAY_TYPE = ["weekday", "weekend"] as const;
export const DayType = z.enum(DAY_TYPE);
export type DayType = z.infer<typeof DayType>;

export const TIME_BLOCK = ["morning", "afternoon", "evening", "night"] as const;
export const TimeBlock = z.enum(TIME_BLOCK);
export type TimeBlock = z.infer<typeof TimeBlock>;

export const FORECAST_PROFILE = ["regular", "exam"] as const;
export const ForecastProfile = z.enum(FORECAST_PROFILE);
export type ForecastProfile = z.infer<typeof ForecastProfile>;

export const SLOT_CONFIDENCE = ["measured", "estimated", "none"] as const;
export const SlotConfidence = z.enum(SLOT_CONFIDENCE);
export type SlotConfidence = z.infer<typeof SlotConfidence>;

export const SURVEYOR_ROLE = ["surveyor", "admin"] as const;
export const SurveyorRole = z.enum(SURVEYOR_ROLE);
export type SurveyorRole = z.infer<typeof SurveyorRole>;

export const SPOT_STATUS = ["draft", "published", "archived"] as const;
export const SpotStatus = z.enum(SPOT_STATUS);
export type SpotStatus = z.infer<typeof SpotStatus>;

export const NOISE_SAMPLE_SOURCE = ["survey", "user"] as const;
export const NoiseSampleSource = z.enum(NOISE_SAMPLE_SOURCE);
export type NoiseSampleSource = z.infer<typeof NoiseSampleSource>;

export const REVIEW_STATE = ["unreviewed", "reviewed"] as const;
export const ReviewState = z.enum(REVIEW_STATE);
export type ReviewState = z.infer<typeof ReviewState>;

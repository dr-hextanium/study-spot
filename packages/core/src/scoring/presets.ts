import { z } from "zod";
import { Criterion, SoftTerm } from "./criteria.ts";

export const PRESET_ID = ["silent_solo", "group", "calls", "late_night", "quick_30"] as const;
export type BuiltinPresetId = (typeof PRESET_ID)[number];

export const Preset = z.object({
  id: z.string().min(1).max(40),
  /** Null for built-ins: the UI names them from the copy deck. */
  name: z.string().trim().min(1).max(24).nullable(),
  required: z.array(Criterion).max(16),
  soft: z.array(SoftTerm).max(16),
  /** Choosing the preset sets the time chip (Quick 30). */
  minutes: z.union([z.literal(30), z.literal(60), z.literal(120)]).nullable(),
  /** Non-null: the preset is for a group and shows the people stepper. */
  groupDefault: z.number().int().min(2).max(12).nullable(),
});
export type Preset = z.infer<typeof Preset>;

const outlets = (): SoftTerm => ({ when: { attr: "outlet_coverage_pct", target: 0.5 }, weight: 1 });
const talking = (): SoftTerm => ({
  when: { attr: "noise_policy", target: ["conversational", "group_friendly"] },
  weight: 1,
});

export const BUILTIN_PRESETS: readonly Preset[] = [
  {
    id: "silent_solo",
    name: null,
    minutes: null,
    groupDefault: null,
    required: [{ attr: "noise_policy", target: ["silent", "quiet"] }],
    soft: [
      { when: { attr: "noise_policy", target: ["silent"] }, weight: 2 },
      outlets(),
      { when: { attr: "seat_type", target: "carrel" }, weight: 1 },
    ],
  },
  {
    id: "group",
    name: null,
    minutes: null,
    groupDefault: 3,
    required: [{ attr: "flag", flag: "group_work_ok", target: true }],
    soft: [
      { when: { attr: "flag", flag: "whiteboard", target: true }, weight: 1 },
      { when: { attr: "table_config", target: "small_2_4" }, weight: 1 },
      outlets(),
      talking(),
    ],
  },
  {
    id: "calls",
    name: null,
    minutes: null,
    groupDefault: null,
    required: [{ attr: "calls_ok", target: ["allowed"] }],
    soft: [{ when: { attr: "cell_signal", target: ["good"] }, weight: 2 }, talking(), outlets()],
  },
  {
    id: "late_night",
    name: null,
    minutes: null,
    groupDefault: null,
    required: [],
    soft: [
      { when: { attr: "flag", flag: "open_past_midnight", target: true }, weight: 2 },
      { when: { attr: "flag", flag: "staffed_late", target: true }, weight: 1 },
      { when: { attr: "flag", flag: "lit_route_to_residences", target: true }, weight: 1 },
      { when: { attr: "amenity", target: "late_food" }, weight: 1 },
    ],
  },
  { id: "quick_30", name: null, minutes: 30, groupDefault: null, required: [], soft: [] },
];

/** A built-in or custom preset by id; unknown ids fall back to Silent solo. */
export function presetById(id: string, custom: readonly Preset[]): Preset {
  const found = BUILTIN_PRESETS.find((p) => p.id === id) ?? custom.find((p) => p.id === id);
  if (found !== undefined) return found;
  const fallback = BUILTIN_PRESETS[0];
  if (fallback === undefined) throw new Error("no built-in presets");
  return fallback;
}

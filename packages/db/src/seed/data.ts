/**
 * SAMPLE DATA for development and tests. Not surveyed. Coordinates, hours,
 * and attributes are approximate placeholders, not facts about these spaces.
 */
export const SEED_CAMPUS = { id: "sbu", name: "Stony Brook University", tz: "America/New_York" };

export const SEED_TERMS = [
  {
    id: "2026-fall",
    campus_id: "sbu",
    name: "Fall 2026",
    starts: "2026-08-24",
    ends: "2026-12-19",
    exam_starts: "2026-12-10",
    exam_ends: "2026-12-18",
  },
  {
    id: "2027-spring",
    campus_id: "sbu",
    name: "Spring 2027",
    starts: "2027-01-25",
    ends: "2027-05-21",
    exam_starts: "2027-05-13",
    exam_ends: "2027-05-20",
  },
];

export const SEED_BUILDINGS = [
  {
    id: "melville-library",
    campus_id: "sbu",
    name: "Melville Library",
    lat: 40.9154,
    lng: -73.1222,
  },
  { id: "sac", campus_id: "sbu", name: "Student Activities Center", lat: 40.9145, lng: -73.1243 },
  { id: "student-union", campus_id: "sbu", name: "Student Union", lat: 40.917, lng: -73.1219 },
  { id: "kelly-quad", campus_id: "sbu", name: "Kelly Quad", lat: 40.9104, lng: -73.127 },
];

/** Symmetric walking minutes between seed buildings, in SEED_BUILDINGS order. */
export const SEED_WALK: number[][] = [
  [0, 4, 3, 9],
  [4, 0, 6, 7],
  [3, 6, 0, 11],
  [9, 7, 11, 0],
];

export const SEED_ADMIN = {
  email: "seed-admin@example.invalid",
  display_name: "Seed Admin",
  role: "admin" as const,
};

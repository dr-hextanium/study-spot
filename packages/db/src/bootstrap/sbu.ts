/**
 * PRODUCTION REFERENCE DATA for Stony Brook University (main campus).
 * PENDING OWNER REVIEW: do not run the bootstrap against the live database
 * until the owner has trimmed and approved docs/campus/sbu-buildings.md.
 *
 * Unlike seed/data.ts (SAMPLE data), these are meant to be real. Terms come
 * from the SBU Registrar calendars, coordinates from OpenStreetMap via
 * Nominatim. Several entries are UNCONFIRMED, see the comments below.
 */
export const BOOTSTRAP_CAMPUS = {
  id: "sbu",
  name: "Stony Brook University",
  tz: "America/New_York",
};

/**
 * starts: first day of classes. ends: official end of term (last day of
 * finals). Sources are listed in docs/campus/sbu-buildings.md.
 */
export const BOOTSTRAP_TERMS = [
  {
    id: "2026-fall",
    campus_id: "sbu",
    name: "Fall 2026",
    starts: "2026-08-24",
    ends: "2026-12-17",
    exam_starts: "2026-12-09",
    exam_ends: "2026-12-17",
  },
  {
    id: "2027-spring",
    campus_id: "sbu",
    name: "Spring 2027",
    starts: "2027-01-25",
    ends: "2027-05-19",
    exam_starts: "2027-05-11",
    exam_ends: "2027-05-19",
  },
];

export const BOOTSTRAP_BUILDINGS = [
  {
    id: "melville-library",
    campus_id: "sbu",
    name: "Melville Library",
    lat: 40.9155304,
    lng: -73.1227132,
  },
  {
    id: "sac",
    campus_id: "sbu",
    name: "Student Activities Center",
    lat: 40.9143128,
    lng: -73.1241779,
  },
  {
    id: "student-union",
    campus_id: "sbu",
    name: "Stony Brook Union",
    lat: 40.9170763,
    lng: -73.1224619,
  },
  {
    id: "javits",
    campus_id: "sbu",
    name: "Javits Lecture Center",
    lat: 40.9129595,
    lng: -73.1220849,
  },
  { id: "frey", campus_id: "sbu", name: "Frey Hall", lat: 40.9156581, lng: -73.1238769 },
  {
    id: "computer-science",
    campus_id: "sbu",
    name: "Computer Science",
    lat: 40.9125908,
    lng: -73.1228923,
  },
  { id: "engineering", campus_id: "sbu", name: "Engineering", lat: 40.913517, lng: -73.1244938 },
  {
    id: "light-engineering",
    campus_id: "sbu",
    name: "Light Engineering",
    lat: 40.9135471,
    lng: -73.1254078,
  },
  {
    id: "heavy-engineering",
    campus_id: "sbu",
    name: "Heavy Engineering",
    lat: 40.9124705,
    lng: -73.1259375,
  },
  { id: "physics", campus_id: "sbu", name: "Physics", lat: 40.9162494, lng: -73.125969 },
  { id: "math-tower", campus_id: "sbu", name: "Math Tower", lat: 40.9158448, lng: -73.1263329 },
  {
    id: "earth-space-sciences",
    campus_id: "sbu",
    name: "Earth and Space Sciences",
    lat: 40.9149821,
    lng: -73.1256769,
  },
  {
    id: "life-sciences",
    campus_id: "sbu",
    name: "Life Sciences",
    lat: 40.9117017,
    lng: -73.1201377,
  },
  { id: "chemistry", campus_id: "sbu", name: "Chemistry", lat: 40.9163877, lng: -73.1237109 },
  { id: "humanities", campus_id: "sbu", name: "Humanities", lat: 40.9139433, lng: -73.120876 },
  { id: "psychology-a", campus_id: "sbu", name: "Psychology A", lat: 40.9142145, lng: -73.122533 },
  { id: "psychology-b", campus_id: "sbu", name: "Psychology B", lat: 40.9139053, lng: -73.1222702 },
  {
    id: "social-behavioral-sciences",
    campus_id: "sbu",
    name: "Social and Behavioral Sciences",
    lat: 40.9130601,
    lng: -73.1200679,
  },
  {
    id: "harriman-hall",
    campus_id: "sbu",
    name: "Harriman Hall",
    lat: 40.9157505,
    lng: -73.1254488,
  },
  {
    id: "wang-center",
    campus_id: "sbu",
    name: "Charles B. Wang Center",
    lat: 40.9159731,
    lng: -73.1197807,
  },
  {
    id: "simons-center",
    campus_id: "sbu",
    name: "Simons Center for Geometry and Physics",
    lat: 40.9157996,
    lng: -73.1269587,
  },
  {
    id: "staller-center",
    campus_id: "sbu",
    name: "Staller Center for the Arts",
    lat: 40.9154816,
    lng: -73.1211291,
  },
  // UNCONFIRMED: point is the HSC building; the library has no OSM match
  {
    id: "hsc-library",
    campus_id: "sbu",
    name: "Health Sciences Center (Library)",
    lat: 40.9100759,
    lng: -73.116569,
  },
  { id: "kelly-quad", campus_id: "sbu", name: "Kelly Quad", lat: 40.9137884, lng: -73.1310169 },
  // UNCONFIRMED: matches "Roosevelt Quad Hill" (a park), not the residence area
  {
    id: "roosevelt-quad",
    campus_id: "sbu",
    name: "Roosevelt Quad",
    lat: 40.9118246,
    lng: -73.1305577,
  },
  { id: "tabler-quad", campus_id: "sbu", name: "Tabler Quad", lat: 40.9093703, lng: -73.1270914 },
  { id: "h-quad", campus_id: "sbu", name: "H Quad", lat: 40.9198979, lng: -73.1193768 },
  {
    id: "mendelsohn-quad",
    campus_id: "sbu",
    name: "Mendelsohn Quad",
    lat: 40.9176808,
    lng: -73.1202223,
  },
  { id: "roth-quad", campus_id: "sbu", name: "Roth Quad", lat: 40.911359, lng: -73.123898 },
  {
    id: "west-apartments",
    campus_id: "sbu",
    name: "West Apartments",
    lat: 40.9124569,
    lng: -73.1346847,
  },
  {
    id: "chapin-apartments",
    campus_id: "sbu",
    name: "Chapin Apartments",
    lat: 40.9073085,
    lng: -73.1092909,
  },
  // Residence quad community centers. "RCC" is not an SBU term; names below are from Campus Residences.
  {
    id: "roosevelt-rcc",
    campus_id: "sbu",
    name: "Alan S. deVries Center",
    lat: 40.9121593,
    lng: -73.1299618,
  },
  // UNCONFIRMED: name is official; point is OSM's Tabler Center for Arts, Culture, and Humanities, not verified to be the same building
  {
    id: "tabler-rcc",
    campus_id: "sbu",
    name: "Tabler Community Center",
    lat: 40.9098669,
    lng: -73.127097,
  },
  // UNCONFIRMED: name is official; no OSM match, point is the Roth Quad centre
  {
    id: "roth-rcc",
    campus_id: "sbu",
    name: "Roth Community Center",
    lat: 40.911359,
    lng: -73.123898,
  },
  // UNCONFIRMED: name is official; point is OSM's Benedict College (H Quad), not verified to hold the center
  {
    id: "h-rcc",
    campus_id: "sbu",
    name: "Benedict Community Center",
    lat: 40.9195968,
    lng: -73.1186016,
  },
  // UNCONFIRMED: SBU says it is in Gray Hall; no OSM match, point is Gray College
  {
    id: "mendelsohn-rcc",
    campus_id: "sbu",
    name: "Mendelsohn Center",
    lat: 40.9177462,
    lng: -73.1212657,
  },
  // UNCONFIRMED: SBU names it (attached to Building E, area office); no OSM match, point is the West Apartments centre
  { id: "west-rcc", campus_id: "sbu", name: "West E Commons", lat: 40.9124569, lng: -73.1346847 },
  { id: "chapin-rcc", campus_id: "sbu", name: "Chapin Commons", lat: 40.9080987, lng: -73.1102916 },
];

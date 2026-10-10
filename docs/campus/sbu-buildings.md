# SBU campus reference data (draft for owner review)

Checked 2026-10-10. Nothing here is loaded into the live database. Trim the table, then run `bun run db:bootstrap`. The same data lives in `packages/db/src/bootstrap/sbu.ts`.

## Terms

All dates are confirmed on official SBU Registrar pages. `ends` is the official end of term (last day of finals).

| Term | First day of classes | Last day of classes | Exams start | Exams end / term end |
|---|---|---|---|---|
| Fall 2026 (`2026-fall`) | 2026-08-24 | 2026-12-07 (M-F), 2026-12-05 (Sat) | 2026-12-09 | 2026-12-17 |
| Spring 2027 (`2027-spring`) | 2027-01-25 | 2027-05-07 (M-F), 2027-05-08 (Sat) | 2027-05-11 | 2027-05-19 |

Sources:
- Fall 2026 undergrad: https://www.stonybrook.edu/registrar/academic-calendar/current-terms/undergrad-calendar-fall-2026.html (classes begin Aug 24, classes end Dec 7, exams Dec 9 to 17, official end of term Dec 17)
- Spring 2027 undergrad: https://www.stonybrook.edu/registrar/academic-calendar/current-terms/undergrad-calendar-spring-2027.html (classes begin Jan 25, exams May 11 to 19, official end of semester May 19)
- Both terms: https://www.stonybrook.edu/registrar/academic-calendar/university-calendars/fall2026-summer2027.html

Notes:
- The Spring 2027 undergrad page labels May 8 (Sat) as the last day of classes; the university calendar lists May 7 for M-F and May 8 for Saturday classes. The schema does not store last day of classes.
- Exam periods include Saturday and reading days inside them. Calendars say they are subject to change.
- Health Sciences programs have their own calendar. Not modeled.

## Buildings (38)

Coordinates come from OpenStreetMap via Nominatim (one request a second, descriptive User-Agent), from the matched feature's point. Source is the OSM element at https://www.openstreetmap.org/. Names are OSM or common SBU names; check them against the SBU campus map. The brief's Health Sciences Center and Library are one row.

| id | name | lat | lng | source (OSM) | notes |
|---|---|---|---|---|---|
| melville-library | Melville Library | 40.9155304 | -73.1227132 | [way/54723529](https://www.openstreetmap.org/way/54723529) | OSM name "Frank Melville Jr. Memorial Library" |
| sac | Student Activities Center | 40.9143128 | -73.1241779 | [relation/555625](https://www.openstreetmap.org/relation/555625) |  |
| student-union | Stony Brook Union | 40.9170763 | -73.1224619 | [way/54723530](https://www.openstreetmap.org/way/54723530) | Nominatim first hit was a bus stop; used the building |
| javits | Javits Lecture Center | 40.9129595 | -73.1220849 | [way/54719246](https://www.openstreetmap.org/way/54719246) |  |
| frey | Frey Hall | 40.9156581 | -73.1238769 | [way/60911996](https://www.openstreetmap.org/way/60911996) |  |
| computer-science | Computer Science | 40.9125908 | -73.1228923 | [way/54719325](https://www.openstreetmap.org/way/54719325) | In Roth Quad area |
| engineering | Engineering | 40.913517 | -73.1244938 | [way/60911991](https://www.openstreetmap.org/way/60911991) |  |
| light-engineering | Light Engineering | 40.9135471 | -73.1254078 | [way/60911992](https://www.openstreetmap.org/way/60911992) |  |
| heavy-engineering | Heavy Engineering | 40.9124705 | -73.1259375 | [way/60911994](https://www.openstreetmap.org/way/60911994) |  |
| physics | Physics | 40.9162494 | -73.125969 | [way/60912003](https://www.openstreetmap.org/way/60912003) |  |
| math-tower | Math Tower | 40.9158448 | -73.1263329 | [way/60912002](https://www.openstreetmap.org/way/60912002) |  |
| earth-space-sciences | Earth and Space Sciences | 40.9149821 | -73.1256769 | [way/54722289](https://www.openstreetmap.org/way/54722289) | OSM name "Earth & Space Sciences" |
| life-sciences | Life Sciences | 40.9117017 | -73.1201377 | [way/60922581](https://www.openstreetmap.org/way/60922581) |  |
| chemistry | Chemistry | 40.9163877 | -73.1237109 | [way/60911995](https://www.openstreetmap.org/way/60911995) |  |
| humanities | Humanities | 40.9139433 | -73.120876 | [way/60912001](https://www.openstreetmap.org/way/60912001) |  |
| psychology-a | Psychology A | 40.9142145 | -73.122533 | [way/55675447](https://www.openstreetmap.org/way/55675447) |  |
| psychology-b | Psychology B | 40.9139053 | -73.1222702 | [relation/8826980](https://www.openstreetmap.org/relation/8826980) |  |
| social-behavioral-sciences | Social and Behavioral Sciences | 40.9130601 | -73.1200679 | [way/60911990](https://www.openstreetmap.org/way/60911990) |  |
| harriman-hall | Harriman Hall | 40.9157505 | -73.1254488 | [way/60912004](https://www.openstreetmap.org/way/60912004) |  |
| wang-center | Charles B. Wang Center | 40.9159731 | -73.1197807 | [way/60911998](https://www.openstreetmap.org/way/60911998) |  |
| simons-center | Simons Center for Geometry and Physics | 40.9157996 | -73.1269587 | [way/289263333](https://www.openstreetmap.org/way/289263333) |  |
| staller-center | Staller Center for the Arts | 40.9154816 | -73.1211291 | [way/54721788](https://www.openstreetmap.org/way/54721788) |  |
| hsc-library | Health Sciences Center (Library) | 40.9100759 | -73.116569 | [way/60922552](https://www.openstreetmap.org/way/60922552) | UNCONFIRMED: point is the HSC building; the library has no OSM match |
| kelly-quad | Kelly Quad | 40.9137884 | -73.1310169 | [way/583327339](https://www.openstreetmap.org/way/583327339) | Residential area polygon centre |
| roosevelt-quad | Roosevelt Quad | 40.9118246 | -73.1305577 | [way/632665541](https://www.openstreetmap.org/way/632665541) | UNCONFIRMED: matches "Roosevelt Quad Hill" (a park), not the residence area |
| tabler-quad | Tabler Quad | 40.9093703 | -73.1270914 | [way/583327337](https://www.openstreetmap.org/way/583327337) | Residential area polygon centre |
| h-quad | H Quad | 40.9198979 | -73.1193768 | [way/583327341](https://www.openstreetmap.org/way/583327341) | Residential area polygon centre |
| mendelsohn-quad | Mendelsohn Quad | 40.9176808 | -73.1202223 | [way/583327340](https://www.openstreetmap.org/way/583327340) | Residential area polygon centre |
| roth-quad | Roth Quad | 40.911359 | -73.123898 | [way/583327342](https://www.openstreetmap.org/way/583327342) | Added: not in the brief, houses the CS building |
| west-apartments | West Apartments | 40.9124569 | -73.1346847 | [way/835672152](https://www.openstreetmap.org/way/835672152) | Residential area polygon centre |
| chapin-apartments | Chapin Apartments | 40.9073085 | -73.1092909 | [way/837984214](https://www.openstreetmap.org/way/837984214) | Residential area polygon centre |

Residence quad community centers (the "RCC" rows). Official names and hours: [Residential Community Centers](https://www.stonybrook.edu/commcms/studentaffairs/res/services/residentialcommunitycenters.php) (Tabler, Roth, Benedict, Alan S. deVries); [Mendelsohn Center](https://www.stonybrook.edu/commcms/undergraduate-colleges/communities-and-facilities/facilities/mendelsohncenter); [West Apartments](https://www.stonybrook.edu/commcms/studentaffairs/res/housing/undergraduate_housing/west_apartments.php); Chapin Commons on the [Fitness Centers](https://www.stonybrook.edu/commcms/studentaffairs/res/services/fitness_centers.php) page. SBU does not use the term "RCC". Kelly has no center of its own: its study space is the deVries (HDV/GLS) center, so there is no `kelly-rcc`. No H Quad commons was found; Benedict Community Center is the only candidate.

| id | name | lat | lng | source (OSM) | notes |
|---|---|---|---|---|---|
| roosevelt-rcc | Alan S. deVries Center | 40.9121593 | -73.1299618 | [way/1308434317](https://www.openstreetmap.org/way/1308434317) | OSM places it in Kelly Quad; Campus Residences lists it as the Eleanor Roosevelt community center. Also serves Kelly |
| tabler-rcc | Tabler Community Center | 40.9098669 | -73.127097 | [way/60923788](https://www.openstreetmap.org/way/60923788) | UNCONFIRMED: name is official; point is OSM's Tabler Center for Arts, Culture, and Humanities, not verified to be the same building |
| roth-rcc | Roth Community Center | 40.911359 | -73.123898 | [way/583327342](https://www.openstreetmap.org/way/583327342) | UNCONFIRMED: name is official; no OSM match, point is the Roth Quad centre |
| h-rcc | Benedict Community Center | 40.9195968 | -73.1186016 | [way/60922568](https://www.openstreetmap.org/way/60922568) | UNCONFIRMED: name is official; point is OSM's Benedict College (H Quad), not verified to hold the center |
| mendelsohn-rcc | Mendelsohn Center | 40.9177462 | -73.1212657 | [way/376164548](https://www.openstreetmap.org/way/376164548) | UNCONFIRMED: SBU says it is in Gray Hall; no OSM match, point is Gray College |
| west-rcc | West E Commons | 40.9124569 | -73.1346847 | [way/835672152](https://www.openstreetmap.org/way/835672152) | UNCONFIRMED: SBU names it (attached to Building E, area office); no OSM match, point is the West Apartments centre |
| chapin-rcc | Chapin Commons | 40.9080987 | -73.1102916 | [way/833000705](https://www.openstreetmap.org/way/833000705) | name per SBU; OSM way found |

## UNCONFIRMED

- `hsc-library`: coordinates are the Health Sciences Center building, not the library entrance.
- `roosevelt-quad`: Nominatim only found a park feature (`way/632665541`) and an inner-quad lawn, not the residence area.
- `tabler-rcc`: name is official; point is OSM's Tabler Center for Arts, Culture, and Humanities, not verified to be the same building
- `roth-rcc`: name is official; no OSM match, point is the Roth Quad centre
- `h-rcc`: name is official; point is OSM's Benedict College (H Quad), not verified to hold the center
- `mendelsohn-rcc`: SBU says it is in Gray Hall; no OSM match, point is Gray College
- `west-rcc`: SBU names it (attached to Building E, area office); no OSM match, point is the West Apartments centre

## Walk matrix

Not part of this bootstrap. `buildBundle` builds a full matrix and falls back to flagged straight-line estimates for any missing pair, so an empty `walk_matrix` is valid until the walk matrix task.

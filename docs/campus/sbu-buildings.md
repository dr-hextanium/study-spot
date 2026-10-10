# SBU campus reference data (draft for owner review)

Checked 2026-10-10. Loaded into the live database with `bun run db:bootstrap`. The same data lives in `packages/db/src/bootstrap/sbu.ts`.

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

## Buildings (138)

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

### Every other named building (100)

Pulled 2026-10-10 from Overpass: every `building` with a `name` inside the OSM campus area (relation 14321838), point is the element centre. Southampton, buildings already listed above, and anything within 12 m of another were left out first.

| id | name | lat | lng | source (OSM) | notes |
|---|---|---|---|---|---|
| administration | Administration | 40.9146873 | -73.1203495 | [way/60912000](https://www.openstreetmap.org/way/60912000) | OSM building=university |
| ammann-college | Ammann College | 40.9187214 | -73.1207624 | [way/376164547](https://www.openstreetmap.org/way/376164547) | OSM building=dormitory |
| athletic-indoor-practice-facility | Athletic Indoor Practice Facility | 40.9210051 | -73.1234642 | [way/840106569](https://www.openstreetmap.org/way/840106569) | OSM building=university |
| baruch-college | Baruch College | 40.9138632 | -73.131828 | [way/60923548](https://www.openstreetmap.org/way/60923548) | OSM building=dormitory |
| basic-sciences-tower | Basic Sciences Tower | 40.9103145 | -73.1167607 | [way/60922564](https://www.openstreetmap.org/way/60922564) | OSM building=university |
| benedict | Benedict | 40.9205115 | -73.1184887 | [way/832752591](https://www.openstreetmap.org/way/832752591) | OSM building=yes |
| bioengineering | Bioengineering | 40.9122251 | -73.1201606 | [way/60922583](https://www.openstreetmap.org/way/60922583) | OSM building=university |
| boat-house | Boat House | 40.9040938 | -73.1190279 | [way/55445552](https://www.openstreetmap.org/way/55445552) | OSM building=university |
| cardozo-college | Cardozo College | 40.9109033 | -73.1247158 | [way/60922579](https://www.openstreetmap.org/way/60922579) | OSM building=dormitory |
| centers-for-molecular-medicine | Centers for Molecular Medicine | 40.9118173 | -73.1193194 | [way/60922582](https://www.openstreetmap.org/way/60922582) | OSM building=university |
| challenger-hall | Challenger Hall | 40.904858 | -73.1182791 | [way/55445542](https://www.openstreetmap.org/way/55445542) | OSM building=university |
| chapin | Chapin | 40.908382 | -73.1115936 | [relation/11512040](https://www.openstreetmap.org/relation/11512040) | OSM building=yes |
| chapin-a | Chapin A | 40.9077328 | -73.1105399 | [way/464222752](https://www.openstreetmap.org/way/464222752) | OSM building=apartments |
| chapin-b | Chapin B | 40.9076978 | -73.1097729 | [way/464222747](https://www.openstreetmap.org/way/464222747) | OSM building=apartments |
| chapin-c | Chapin C | 40.9076105 | -73.1090629 | [way/464222568](https://www.openstreetmap.org/way/464222568) | OSM building=apartments |
| chapin-d | Chapin D | 40.9072551 | -73.1088623 | [way/464222577](https://www.openstreetmap.org/way/464222577) | OSM building=apartments |
| chapin-e | Chapin E | 40.907054 | -73.1095168 | [way/464222734](https://www.openstreetmap.org/way/464222734) | OSM building=apartments |
| chapin-f | Chapin F | 40.9071984 | -73.1103631 | [way/464222744](https://www.openstreetmap.org/way/464222744) | OSM building=apartments |
| chapin-g | Chapin G | 40.9066365 | -73.1099698 | [way/464222733](https://www.openstreetmap.org/way/464222733) | OSM building=apartments |
| chapin-h | Chapin H | 40.9066379 | -73.1093672 | [way/464222583](https://www.openstreetmap.org/way/464222583) | OSM building=apartments |
| chapin-i | Chapin I | 40.9066361 | -73.108756 | [way/464222575](https://www.openstreetmap.org/way/464222575) | OSM building=apartments |
| chapin-j | Chapin J | 40.9067004 | -73.1080449 | [way/464222574](https://www.openstreetmap.org/way/464222574) | OSM building=apartments |
| chapin-k | Chapin K | 40.9070626 | -73.1081588 | [way/464222625](https://www.openstreetmap.org/way/464222625) | OSM building=apartments |
| chapin-l | Chapin L | 40.9075431 | -73.1080941 | [way/464222572](https://www.openstreetmap.org/way/464222572) | OSM building=apartments |
| child-care | Child Care | 40.8982367 | -73.1281035 | [way/837580870](https://www.openstreetmap.org/way/837580870) | OSM building=yes |
| clark | Clark | 40.9136989 | -73.1151498 | [way/464224138](https://www.openstreetmap.org/way/464224138) | OSM building=yes |
| computing-center | Computing Center | 40.9130471 | -73.1260771 | [way/60911993](https://www.openstreetmap.org/way/60911993) | OSM building=university |
| dana-hall | Dana Hall | 40.9060322 | -73.1189396 | [way/464222173](https://www.openstreetmap.org/way/464222173) | OSM building=university |
| dewey-college | Dewey College | 40.9132866 | -73.1312013 | [way/60923543](https://www.openstreetmap.org/way/60923543) | OSM building=dormitory |
| discovery-hall | Discovery Hall | 40.9041471 | -73.1185009 | [way/55445546](https://www.openstreetmap.org/way/55445546) | OSM building=university |
| douglass-college | Douglass College | 40.9090794 | -73.1264565 | [way/60923792](https://www.openstreetmap.org/way/60923792) | OSM building=dormitory |
| dreiser-college | Dreiser College | 40.9087852 | -73.1273714 | [way/60923793](https://www.openstreetmap.org/way/60923793) | OSM building=dormitory |
| dutchess-hall | Dutchess Hall | 40.9053637 | -73.1190977 | [way/55445555](https://www.openstreetmap.org/way/55445555) | OSM building=university |
| east-side-dining-ch-vez-hall | East Side Dining / Chávez Hall | 40.916856 | -73.1207083 | [way/509971885](https://www.openstreetmap.org/way/509971885) | OSM building=yes |
| educational-communications-center | Educational Communications Center | 40.9133938 | -73.1225079 | [way/835679665](https://www.openstreetmap.org/way/835679665) | OSM building=university |
| eisenhower-college | Eisenhower College | 40.9145515 | -73.1317407 | [way/60923538](https://www.openstreetmap.org/way/60923538) | OSM building=dormitory |
| endeavour-hall | Endeavour Hall | 40.9043172 | -73.1177482 | [way/55445550](https://www.openstreetmap.org/way/55445550) | OSM building=university |
| gershwin-college | Gershwin College | 40.9112116 | -73.1225093 | [way/60922584](https://www.openstreetmap.org/way/60922584) | OSM building=dormitory |
| gray-college | Gray College | 40.9177844 | -73.1209292 | [way/376164548](https://www.openstreetmap.org/way/376164548) | OSM building=dormitory |
| greeley-hall | Greeley Hall | 40.9117461 | -73.1310234 | [way/60923553](https://www.openstreetmap.org/way/60923553) | OSM building=dormitory |
| hamilton-college | Hamilton College | 40.9137765 | -73.1306543 | [way/60923541](https://www.openstreetmap.org/way/60923541) | OSM building=dormitory |
| hand-college | Hand College | 40.9097527 | -73.1261085 | [way/60923790](https://www.openstreetmap.org/way/60923790) | OSM building=dormitory |
| health-sciences-tower | Health Sciences Tower | 40.9097105 | -73.1161727 | [way/60922546](https://www.openstreetmap.org/way/60922546) | OSM building=university |
| hendrix-college | Hendrix College | 40.9118268 | -73.1230481 | [way/60922585](https://www.openstreetmap.org/way/60922585) | OSM building=dormitory |
| institute-for-advanced-computational-science | Institute for Advanced Computational Science | 40.9120576 | -73.1208774 | [way/878797831](https://www.openstreetmap.org/way/878797831) | OSM building=university |
| island-federal-credit-union-arena | Island Federal Credit Union Arena | 40.9174128 | -73.1259794 | [way/884030734](https://www.openstreetmap.org/way/884030734) | OSM building=stadium |
| james-college | James College | 40.9192742 | -73.1203234 | [way/60922569](https://www.openstreetmap.org/way/60922569) | OSM building=dormitory |
| keller-hall | Keller Hall | 40.9115494 | -73.1301524 | [way/60923544](https://www.openstreetmap.org/way/60923544) | OSM building=dormitory |
| kelly | Kelly | 40.9134136 | -73.129193 | [way/837951685](https://www.openstreetmap.org/way/837951685) | OSM building=yes |
| kenneth-p-lavalle-athletic-stadium | Kenneth P. LaValle Athletic Stadium | 40.9188004 | -73.1242115 | [relation/13023087](https://www.openstreetmap.org/relation/13023087) | OSM building=stadium |
| langmuir-college | Langmuir College | 40.9203187 | -73.1201554 | [way/60922567](https://www.openstreetmap.org/way/60922567) | OSM building=dormitory |
| lauterbur-hall | Lauterbur Hall | 40.9124907 | -73.1297908 | [way/1308434318](https://www.openstreetmap.org/way/1308434318) | OSM building=dormitory |
| long-island-high-technology-incubator | Long Island High Technology Incubator | 40.9125618 | -73.1140532 | [way/60922563](https://www.openstreetmap.org/way/60922563) | OSM building=commercial |
| mount-college | Mount College | 40.9116282 | -73.1244387 | [way/60922577](https://www.openstreetmap.org/way/60922577) | OSM building=dormitory |
| nassau-hall | Nassau Hall | 40.9060651 | -73.1209224 | [way/55445669](https://www.openstreetmap.org/way/55445669) | OSM building=university |
| new-computer-science | New Computer Science | 40.9129482 | -73.1235594 | [way/529707497](https://www.openstreetmap.org/way/529707497) | OSM building=university |
| new-engineering-building | New Engineering Building | 40.9128343 | -73.1276348 | [way/1422741325](https://www.openstreetmap.org/way/1422741325) | OSM building=construction |
| nobel | Nobel | 40.9129978 | -73.1294874 | [way/833462920](https://www.openstreetmap.org/way/833462920) | OSM building=yes |
| o-neill-and-irving-college | O'Neill and Irving College | 40.9180619 | -73.1196061 | [way/60922559](https://www.openstreetmap.org/way/60922559) | OSM building=dormitory |
| putnam-hall | Putnam Hall | 40.9057685 | -73.1196431 | [way/55445553](https://www.openstreetmap.org/way/55445553) | OSM building=university |
| roosevelt | Roosevelt | 40.9120299 | -73.1280532 | [way/832761783](https://www.openstreetmap.org/way/832761783) | OSM building=yes |
| roth-cafe | Roth Cafe | 40.9107758 | -73.1238374 | [way/60922575](https://www.openstreetmap.org/way/60922575) | OSM building=yes |
| roth-tabler | Roth/Tabler | 40.910373 | -73.1241184 | [way/837628513](https://www.openstreetmap.org/way/837628513) | OSM building=yes |
| sanger-college | Sanger College | 40.9096203 | -73.1283989 | [way/60923786](https://www.openstreetmap.org/way/60923786) | OSM building=dormitory |
| scan-center | SCAN Center | 40.9108077 | -73.1199846 | [way/833657852](https://www.openstreetmap.org/way/833657852) | OSM building=university |
| schick-college | Schick College | 40.9143807 | -73.1310977 | [way/60923540](https://www.openstreetmap.org/way/60923540) | OSM building=dormitory |
| schomburg-apartments-a | Schomburg Apartments A | 40.9132489 | -73.1322779 | [way/60923546](https://www.openstreetmap.org/way/60923546) | OSM building=apartments |
| schomburg-apartments-b | Schomburg Apartments B | 40.9130964 | -73.132599 | [way/60923547](https://www.openstreetmap.org/way/60923547) | OSM building=apartments |
| schomburg-commons | Schomburg Commons | 40.9134841 | -73.1328101 | [way/833425993](https://www.openstreetmap.org/way/833425993) | OSM building=yes |
| seawolves-village | Seawolves Village | 40.9210301 | -73.1217482 | [way/1423669233](https://www.openstreetmap.org/way/1423669233) | OSM building=construction |
| sports-complex | Sports Complex | 40.9173444 | -73.1247268 | [way/54722854](https://www.openstreetmap.org/way/54722854) | OSM building=university |
| stimson-hall | Stimson Hall | 40.9118343 | -73.1294746 | [way/60923545](https://www.openstreetmap.org/way/60923545) | OSM building=dormitory |
| stony-brook-child-care | Stony Brook Child Care | 40.8987412 | -73.1290174 | [way/464235436](https://www.openstreetmap.org/way/464235436) | OSM building=school |
| stony-brook-lirr-station | Stony Brook LIRR Station | 40.9213939 | -73.1274957 | [way/832752593](https://www.openstreetmap.org/way/832752593) | not SBU, kept because students use it all the time |
| stony-brook-observatory | Stony Brook Observatory | 40.91471 | -73.1256773 | [way/838236980](https://www.openstreetmap.org/way/838236980) | OSM building=yes |
| student-activity-center | Student Activity Center | 40.9144387 | -73.1247866 | [way/718409738](https://www.openstreetmap.org/way/718409738) | OSM building=yes |
| student-health-center | Student Health Center | 40.9193259 | -73.1217468 | [way/60922573](https://www.openstreetmap.org/way/60922573) | OSM building=university |
| suffolk-hall | Suffolk Hall | 40.9054829 | -73.1210186 | [way/464222172](https://www.openstreetmap.org/way/464222172) | OSM building=university |
| tabler-quad-new-residential-hall | Tabler Quad New Residential Hall | 40.9107629 | -73.1280078 | [way/1552040250](https://www.openstreetmap.org/way/1552040250) | OSM building=construction |
| the-louis-and-beatrice-laufer-center | The Louis and Beatrice Laufer Center | 40.9120365 | -73.120694 | [way/60922588](https://www.openstreetmap.org/way/60922588) | OSM building=university |
| toscanini-college | Toscanini College | 40.9102443 | -73.1279538 | [way/60923796](https://www.openstreetmap.org/way/60923796) | OSM building=dormitory |
| tubman-hall | Tubman Hall | 40.9169449 | -73.1192121 | [way/510000932](https://www.openstreetmap.org/way/510000932) | OSM building=dormitory |
| van-de-graaf-accelerator | Van de Graaf Accelerator | 40.91606 | -73.1248372 | [way/60912005](https://www.openstreetmap.org/way/60912005) | OSM building=university |
| wagner-hall | Wagner Hall | 40.9123409 | -73.1308564 | [way/60923552](https://www.openstreetmap.org/way/60923552) | OSM building=dormitory |
| walter-j-hawrys-campus-recreation-center | Walter J. Hawrys Campus Recreation Center | 40.9172431 | -73.1234331 | [way/551685386](https://www.openstreetmap.org/way/551685386) | OSM building=yes |
| west-apartments-a | West Apartments A | 40.9116027 | -73.1325394 | [way/832761772](https://www.openstreetmap.org/way/832761772) | OSM building=apartments |
| west-apartments-b | West Apartments B | 40.9117905 | -73.1339272 | [way/60923554](https://www.openstreetmap.org/way/60923554) | OSM building=apartments |
| west-apartments-c | West Apartments C | 40.9119518 | -73.1332374 | [way/832761773](https://www.openstreetmap.org/way/832761773) | OSM building=apartments |
| west-apartments-d | West Apartments D | 40.9122833 | -73.1326058 | [way/60923550](https://www.openstreetmap.org/way/60923550) | OSM building=apartments |
| west-apartments-e | West Apartments E | 40.9122852 | -73.1343634 | [way/60922539](https://www.openstreetmap.org/way/60922539) | OSM building=apartments |
| west-apartments-f | West Apartments F | 40.9121751 | -73.1354141 | [way/60922537](https://www.openstreetmap.org/way/60922537) | OSM building=apartments |
| west-apartments-g | West Apartments G | 40.9128706 | -73.1356046 | [way/60922527](https://www.openstreetmap.org/way/60922527) | OSM building=apartments |
| west-apartments-h | West Apartments H | 40.9129078 | -73.1346683 | [way/60922540](https://www.openstreetmap.org/way/60922540) | OSM building=apartments |
| west-apartments-i | West Apartments I | 40.9135635 | -73.1344133 | [way/396875316](https://www.openstreetmap.org/way/396875316) | OSM building=apartments |
| west-apartments-j | West Apartments J | 40.9112179 | -73.1354701 | [way/833408403](https://www.openstreetmap.org/way/833408403) | OSM building=apartments |
| west-apartments-k | West Apartments K | 40.9122553 | -73.1364777 | [way/833408404](https://www.openstreetmap.org/way/833408404) | OSM building=apartments |
| west-side-dining | West Side Dining | 40.9132406 | -73.1303215 | [way/60923542](https://www.openstreetmap.org/way/60923542) | OSM building=yes |
| whitman-college | Whitman College | 40.910839 | -73.1229225 | [way/60922576](https://www.openstreetmap.org/way/60922576) | OSM building=dormitory |
| wolfie-s-hut | Wolfie's Hut | 40.8966985 | -73.1265875 | [way/464235577](https://www.openstreetmap.org/way/464235577) | OSM building=yes |
| yang-hall | Yang Hall | 40.9125097 | -73.1291023 | [way/1308434319](https://www.openstreetmap.org/way/1308434319) | OSM building=dormitory |

Left out on purpose (not places a student would start or study from):

- 100 ([relation/546843](https://www.openstreetmap.org/relation/546843)): unnamed number, not a building name
- Administration Parking Garage ([way/54509111](https://www.openstreetmap.org/way/54509111)): parking
- Central Services (Receiving) ([way/60922572](https://www.openstreetmap.org/way/60922572)): loading dock
- Central Stores (Warehouse) ([way/60922571](https://www.openstreetmap.org/way/60922571)): warehouse
- Chapin Mailboxes ([way/464222454](https://www.openstreetmap.org/way/464222454)): mailroom shed
- Circle Road ([way/837951684](https://www.openstreetmap.org/way/837951684)): road
- Cooling Tower ([way/838236973](https://www.openstreetmap.org/way/838236973)): utility
- Earth & Space Sciences ([way/54722289](https://www.openstreetmap.org/way/54722289)): same building as earth-space-sciences
- Electrical substation ([way/1423672662](https://www.openstreetmap.org/way/1423672662)): utility
- Engineering Drive Loop ([way/837631834](https://www.openstreetmap.org/way/837631834)): road
- Freight Farm ([way/833400900](https://www.openstreetmap.org/way/833400900)): container farm
- Greeley ([way/838684948](https://www.openstreetmap.org/way/838684948)): duplicate of Greeley Hall
- Gym Road ([way/832752595](https://www.openstreetmap.org/way/832752595)): road
- Health Sciences ([way/836633184](https://www.openstreetmap.org/way/836633184)): tagged parking
- Health Sciences Center ([way/60922552](https://www.openstreetmap.org/way/60922552)): same point as hsc-library
- Hilton Garden Inn Stony Brook ([way/833400901](https://www.openstreetmap.org/way/833400901)): hotel, not SBU
- Hospital Parking Garage ([way/54509740](https://www.openstreetmap.org/way/54509740)): parking
- Long Island State Veterans Home ([relation/6855324](https://www.openstreetmap.org/relation/6855324)): not SBU
- NYS Department of Environmental Conservation ([way/54500382](https://www.openstreetmap.org/way/54500382)): not SBU
- North P Lot ([way/837951716](https://www.openstreetmap.org/way/837951716)): parking
- SBU Transit ([way/464235537](https://www.openstreetmap.org/way/464235537)): bus depot
- Service Group ([way/60922580](https://www.openstreetmap.org/way/60922580)): facilities yard
- South Campus ([way/837580868](https://www.openstreetmap.org/way/837580868)): area name, not a building
- South P Lot ([way/834586394](https://www.openstreetmap.org/way/834586394)): parking
- Stony Brook Cogen Plant ([way/60922570](https://www.openstreetmap.org/way/60922570)): utility
- Tabler Steps ([way/837628510](https://www.openstreetmap.org/way/837628510)): stairs
- Water Treatment ([way/618591311](https://www.openstreetmap.org/way/618591311)): utility
- West C ([way/837628499](https://www.openstreetmap.org/way/837628499)): unclear duplicate of West Apartments C
- West E ([way/837628503](https://www.openstreetmap.org/way/837628503)): unclear duplicate of West Apartments E
- West G ([way/837632871](https://www.openstreetmap.org/way/837632871)): unclear duplicate of West Apartments G

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

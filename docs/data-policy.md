# Data policy

Perch helps Stony Brook students pick a study spot. It is made by students, it is open source, and it keeps as little as it can. This page says what it keeps, where, and what it never keeps. Last updated October 10, 2026.

## Kept on your phone only

These live in your browser's storage on this phone. They are never sent to us.

- Your Home choices: the building you start from, how long, what for, group size and extra filters. The building is saved as a building name, never as coordinates.
- Your access settings: where you live, your quad, and whether you are a grad student. Nobody checks them. They only decide which spots you see as open to you.
- Your custom presets, your Browse choices, the theme, and whether you said no to the install note.
- The last few picks shown in this tab, so Something else and Surprise me do not repeat. They go when the tab closes.
- A copy of the spot list and photos, so Perch works offline.

To delete all of it, clear this site's data in your browser settings.

## Kept on our server

- Pick counts. When you tap Directions, or open a spot from your pick, the app sends that spot's id and nothing else. The server adds one to a count for that spot and hour, in memory, and saves the counts as one total per spot per day. Each tab counts a spot once. A count says how often a spot was picked, never by whom.
- The spot directory: seats, outlets, noise rules, hours, photos and busyness estimates, entered by surveyors.
- For surveyors only: the display name they chose, their role, the edits they made, and hashed sign-in tokens. Students have no account.

## Never kept

- Your location. Use my location asks your phone once, picks the nearest building on the phone, and drops the coordinates. They never leave the phone, and there is no location history.
- Your IP address. The pick count route uses it in memory, only to limit how fast one address can send, and does not log it or save it.
- An account, a device id, a tracking cookie, analytics or ads. Perch has none of these for students.
- Audio. Perch never records sound.

## Who else sees a request

- The app and the spot files are static files served by Cloudflare. The pick count route runs on Render. Like any web host, they may keep standard request logs, which include addresses. We do not use them to follow anyone.
- The map in Browse loads map tiles from OpenFreeMap, only when you open the map. The list works without it.

## What Perch shows

- Busyness is a typical level for that hour, or a surveyor's estimate, and it says which. It is never live.
- Perch shows busyness as words, not head counts, and never shows a count under 5.
- Every spot shows the date it was last checked.

## Where the data comes from

- Student surveyors visit each spot and record what is there, take photos with no people in them, and count how full it is at set times. Busyness forecasts come from those counts, or from surveyor estimates where there are no counts yet.
- Building names and positions come from OpenStreetMap, checked against the campus map. Term and exam dates come from the Stony Brook Registrar's public calendars.
- Nothing comes from logins, university systems behind a login, Wi-Fi, or Bluetooth.

## Licenses

- Code: MIT License.
- Spot data and photos: Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0). Credit "Perch surveyors".
- Map data: OpenStreetMap contributors, under the Open Database License. Map tiles: OpenFreeMap.

## Questions

The source code, this policy, and the full license texts are at https://github.com/dr-hextanium/perch. Open an issue there with any question about your data.

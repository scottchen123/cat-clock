# Cat Clock (cross-platform) — SPEC

## Goal
Two cats live on the desktop and show the time for two people in two cities — one cat per person (default: fawn = Shanghai, lilac = Rijswijk). They walk, run, nap, play with each other and ring alarms ("time to call!"). This is a Windows + macOS rewrite (Tauri) of the Windows-only C#/WPF app in `apps/cat-clock`, published as an open-source GitHub project so anyone in a long-distance relationship / two-timezone team can install it.
Success after 4 weeks: both users keep it running all day on Windows; someone on macOS installs it from GitHub Releases and it works the same; nobody misses a call reminder.

## Core loop
1. Start the app → two cats appear on the taskbar/dock line, each showing its person's city time.
2. Glance at a cat to read the time; sleeping cat (z z z) = that person is outside their awake hours.
3. Cats wander, nap, greet and chase each other; click a cat = meow + hop; drag = pick it up, it dangles, drop = it stays there.
4. At an alarm time the cat rings (bubble + chime); click to stop.
5. Double-click a cat or use the tray/menu-bar icon → settings panel (cities, awake hours, alarms, size, sound).

## Features and acceptance criteria
**F1 Overlay & cats**
1. Two cats are drawn in one transparent, always-on-top, frameless overlay covering the primary screen's work area; clicks outside a cat go through to the apps below (Windows and macOS).
2. Cats use the existing sprite frames (walk 4, run 5, lie 7) from `assets/`; size options Small / Medium / Large (0.6 / 0.75 / 0.95).
3. Cat choice: Both (default) / only lilac / only fawn.

**F2 Time & sleep**
4. Each cat shows its own city's time (HH:MM, big) and city name; fawn = side A (default Shanghai, Asia/Shanghai), lilac = side B (default Rijswijk, Europe/Amsterdam). City and timezone of both sides are editable (IANA zones list).
5. A cat outside its person's awake hours (default 08:00–23:00) lies down and shows "z z z".

**F3 Movement & touch**
6. Awake cats walk, sometimes dash (run frames), sit/lie to rest; they turn at screen edges.
7. Single click: hop + meow. Double click: open the panel. Moving the mouse back and forth over a cat = petting: purr + hearts.
8. Drag: the cat hangs from the grabbed point and swings; on drop it stays exactly there (also at the very top of the screen); dropped within 25 px of the floor it sits on the floor. Position is remembered after restart.
9. When "Walk" is off the cats stay in place.

**F4 Pair play**
10. Cats walking into each other stop nose-to-nose, slow-blink, a heart appears (greet), then one walks off.
11. One cat sometimes walks over and lies down next to a lying partner; one cat's zoomies can make the other chase it.
12. Cats on the same floor never overlap.

**F5 Sound & alarms**
13. Meow: synthesized (no copyrighted audio), lower voice for fawn, higher for lilac. Purr: CC0 recording `purr.wav` (Freesound 639255). Chime: synthesized. Sound on/off in settings.
14. Optional private sounds: files `meow-<cat>-<n>.wav` in the user's app-data `sounds/` folder override the synthesized meow (lets a user use their own recordings; never shipped in the repo).
15. Alarms: add (time, which city's clock, label), on/off, delete. At the time: the cat of that side shows a bubble "Time to call! 该打电话啦" + chime; the other cat walks over; click stops it. Each alarm fires once per day per its zone's date.

**F6 Panel & tray**
16. Settings panel window (simple English + short Chinese): cities/zones, awake hours, alarms, cat choice, size, sound, walk.
17. Tray (Windows) / menu-bar (macOS) icon: Settings, Cats back to the floor, Pause walking, Quit.
18. Settings persist in the OS app-config dir (`settings.json`).

**F7 Publish**
19. GitHub Actions builds Windows (.msi/.exe) and macOS (.dmg, universal) installers on every tag and attaches them to a Release; CI runs `npm run check` on both OSes.
20. README (English + 中文): what it is, screenshot, install, build from source, credits/licenses. Code PolyForm Noncommercial 1.0.0 (was MIT until 2026-11-13); cat art © the author (Gemini-generated, included with permission); purr CC0.

## Non-goals for v1
Multi-monitor (primary screen only), auto-start at login, Linux packaging (may work, untested), code signing / notarization (macOS users right-click → Open the first time), auto-update, more than two cats.

## Data model
`settings.json` (app config dir): `{ cityA, zoneA, cityB, zoneB, awakeA:[from,to], awakeB:[from,to], sound, walk, size, cats:"both"|"lilac"|"fawn", pos:{fawn:{x,y|null}, lilac:{x,y|null}} (y null = on the floor), alarms:[{time, side:"A"|"B", label, on, lastFired}] }`. Pure logic (zones, awake, alarm due/next, settings validation + migration) lives in `src/core.js` with unit tests.

## Stack + why
Tauri 2 (Rust shell + system webview): one codebase for Windows and macOS, small installers (~5–10 MB vs ~100 MB Electron), Rust is already installed here. UI = plain HTML/CSS/ES modules + Canvas, no bundler; `// @ts-check` + JSDoc + `tsc --noEmit` for type safety; `node:test` for logic. Web Audio for sound (synth meow/chime, purr file). One full-screen click-through overlay (instead of one window per cat) so cats can interact in one JS world and moving them costs no window moves; cursor hit-testing toggles click-through. macOS transparent window needs `macOSPrivateApi` (fine outside the App Store).

## Milestones
- **M0 Skeleton** — Tauri app opens the transparent overlay with one static cat on the floor; click-through outside it; `npm run check` green (core.js + tests ported); CI workflow builds on Windows + macOS. (1, partial 2)
- **M1 Time & sleep** — two cats, times + cities, awake/sleep, settings load/save + migration. (2, 3, 4, 5, 18)
- **M2 Movement & touch** — walk/run/lie, click hop, petting, drag + dangle + drop stays. (6, 7, 8, 9)
- **M3 Pair play** — greet, follow-and-lie, chase, no overlap. (10, 11, 12)
- **M4 Sound & alarms** — synth meow/chime, purr, private sound folder, alarms ring + stop. (13, 14, 15)
- **M5 Panel & tray** — settings panel, tray/menu-bar menu. (16, 17)
- **M6 Publish** — release workflow, README EN/中文, LICENSE + credits, fresh public repo on the user's GitHub account, first release. (19, 20)

## Defaults chosen (no need to ask)
Folder `apps/cat-clock-tauri`; app id `com.catclock.app`; npm (few deps); Cargo registry + build output in `11-05/tmp/cargo*` (deletable); the WPF app stays as is until the new one is accepted.

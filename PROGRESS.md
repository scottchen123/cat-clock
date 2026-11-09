# PROGRESS — Cat Clock (cross-platform)

## Now
Published: https://github.com/scottchen123/cat-clock (public). v0.1.1 release is a DRAFT with Windows .msi/.exe (16 MB) and macOS universal .dmg (35 MB); CI green on Windows + macOS. Waiting for the user to publish the draft. (v0.1.0 tag exists but its release run failed: missing npm "tauri" script; tag left in place.)

## Done (release check)
- Released v0.1.1 setup.exe installed silently here (per-user, no UAC): no console window, cats drawn, click-through, panel opens, tray icon + menu shown, tray Quit saves and exits; uninstalled again. Installer is unsigned (SmartScreen note in README).

## Next
- Someone tries the .dmg on a real Mac (not testable here).
- Then: user decides whether to switch from the WPF app (copy settings + private meows to %APPDATA%\com.catclock.app).
- Delete 11-05/tmp/cargo-target (2.1 GB) + cargo-home (0.35 GB) when no more builds are needed.

## Done
- SPEC.md, CLAUDE.md, README stub; `src/core.js` ported from Core.cs with IANA zones + old-settings migration; 6 test groups pass; publishable assets copied (sprites + CC0 purr, no meows).

- M0 (user approved ~3 GB temp): Tauri overlay over the work area, pixel-accurate click-through (174/176 grid points matched the sprite alpha on the real screen), CI + release workflows. Spec review fixes: macOS Accessory (no Dock icon), acceptFirstMouse, visibleOnAllWorkspaces, ad-hoc signing, release note for Sequoia "Open Anyway", layout from the work area (not innerWidth), re-fit every 3 s.
- M1: two cats from settings (Rust load/save in app config dir, CATCLOCK_CONFIG_DIR override for tests), times + cities written on the body, asleep -> lies down + "z z z" above the head; old C# settings migrate (window pos + 20 / + 104). Verified on screen with tmp/cc-test settings. CATCLOCK_DEBUG=1 shows layout numbers.

- M2: walk cycle by distance, run bounds, dashes, rest/lie phases (asleep: mostly lying), click = hop + heart, petting (rub) = hearts, drag = swing from the grab point + longer legs, drop stays (near floor -> floor), position saved on drop + every 20 s, fawn walks over to a resting mouse near the floor. All checked on the real screen with real mouse input (tmp/m2-*.ps1 style scripts).

- M1+M2 review fixes: sleep follows the clock even when the cat can't wander; missed mouse release (buttons==0, lostpointercapture, blur) never leaves the overlay catching clicks; unreadable settings.json is never overwritten (Rust returns Err unless NotFound; JS readOnly), BOM stripped; chase target clamped at screen edges; layout key set only after the window moved; dropped cats kept on screen.
- M3: src/pair.js — greet nose to nose (+ heart, hop, maybe meow), follow & cuddle (lie down next to it), chase on zoomies, reactions to click/petting, blocked + keepApart (gap = body widths x 1.08). Seen on screen: greet, cuddle. tests/cat.test.js: no overlap over 2 min of walking, chase starts, sleep when still/high, drop rules.

- M4: src/sound.js (Web Audio): synth meow (fawn 0.82x, lilac 1.15x), chime, purr.wav loop while petting; private meows via Rust read_private_sound from <config>/sounds/meow-<cat>-<n>.wav (name validated). WebView2 autoplay allowed via additionalBrowserArgs; first click also unlocks audio (macOS). Alarms: due -> bubble (DOM, Stop / 5 min), that side's cat runs to the middle and hops, the other stands beside it, chime every 2.5 s (every 3rd = meow) for 2 min, auto-stop after 10 min, click on cat or Stop ends it. Verified on screen + Stereo Mix recording (chimes + private meow heard; silence after Stop). CATCLOCK_DEBUG shows the last sounds.
- To use the user's own real meows later: copy ../cat-clock/assets/sounds/meow-*.wav into %APPDATA%\com.catclock.app\sounds\ (never into the repo).

- M5: src/panel.html + panel.js (own window "panel", created by async Rust open_panel — sync commands deadlock on Windows when creating windows). Panel sends "settings-patch" events; the overlay owns, applies (rebuilds cats on size/cat change) and saves settings, and answers "panel-ready" with "settings-state". Tray: Settings / Cats back to the floor / Pause walking / Quit (left click = settings). Verified on screen: double-click opens the panel above the cat, size Large grows the cats, new reminder saved. NOT verified: tray menu clicks (can't automate the tray here).

- M3-M5 review fixes: panel patches ignored until settings loaded (+ state pushed after load); lastFired always kept from the overlay; other cat stands on its own side during an alarm; panel listens before asking; Quit (panel/tray) saves first; bubble press unlocks audio; panel gets the same WebView2 args, double-open race handled; snooze dropped with its reminder; panel shows "Can't save" when settings are read-only; macOS tray: left click opens the menu. Verified: panel opens, Quit saves positions and exits.

## How to test (Windows)
- Build: `CARGO_HOME=11-05/tmp/cargo-home CARGO_TARGET_DIR=11-05/tmp/cargo-target npx tauri build --debug --no-bundle` -> `11-05/tmp/cargo-target/debug/cat-clock.exe`.
- Run with `CATCLOCK_CONFIG_DIR=11-05/tmp/cc-test` (scratch settings). Stop the old WPF CatClock while screenshotting and START IT AGAIN afterwards (it is the user's daily app).


## Decisions
- Combined spec review for M1+M2 (M1 is small).
- Old WPF settings are not imported automatically (public users never had them); the user's own file can be copied into the app-config folder by hand (fromJson migrates it).
- Tauri over Electron (small installers, Rust present). One overlay window instead of one window per cat.
- Public sounds: synthesized meow + CC0 purr; private meows only from the user's app-data folder.

## Known issues / backlog
- Installers are 16/35 MB because the sprite PNGs are ~600 KB each: resize/compress them (WebP or smaller PNG) for ~5 MB installers.
- macOS menu-bar icon should be a monochrome template image (uses the colour app icon now).
- Perf: labels re-measured + blurred text drawn every frame; cache labels in an offscreen canvas, clear only cat boxes, ~30 fps when idle.
- First click of a double-click also hops (same as the WPF app).
- Eyelid blinks (old app drew lids for fawn from cat-fawn-eyes.txt) not ported yet.
- Sprite PNGs are ~600 KB each (19 MB total): resize for the web version in M1.

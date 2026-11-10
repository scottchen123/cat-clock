# Cat Clock (cross-platform) — notes for Claude

- What: two desktop cats showing the time in two cities (fawn = side A, default Shanghai; lilac = side B, default Rijswijk). Tauri 2 rewrite of the Windows-only WPF app in `../cat-clock` (that one stays the user's daily app until this one is accepted). Spec: SPEC.md. State: PROGRESS.md.
- Users: a Chinese speaker (English ~B1) + an English speaker. UI text = simple English + short Chinese. Explain to the user in simple Chinese.
- Published: https://github.com/skot-chen/cat-clock (public). Local branch `main` = the public history (authored as skot-chen, set in this repo's git config); `dev-history` = the private build history (authored under the user's other account) — never push it, never name that account here (this file is public).
- The machine's default gh account is a different one (other projects use it) — do not switch it. Push here without switching: `GH_TOKEN=$(gh auth token --user scottchen123) git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin main`. Never ask for or handle tokens; the user logs in with `gh auth login --web` themselves.
- Release: bump version in package.json + src-tauri/tauri.conf.json + Cargo.toml, tag `vX.Y.Z`, push the tag -> .github/workflows/release.yml builds Windows + macOS into a DRAFT release; the user publishes the draft.

## Stack
- Tauri 2 shell (`src-tauri/`, Rust) + plain HTML/CSS/ES modules in `src/` (no bundler). `// @ts-check` + JSDoc; `tsc -p .` for types (global tsc 7 locally, devDep in CI).
- One full-screen transparent always-on-top overlay window; cursor hit-testing toggles click-through. macOS needs `macOSPrivateApi: true`.
- Sound: Web Audio (synth meow/chime) + `src/assets/sounds/purr.wav` (CC0, Freesound 639255).

## Commands
- `npm run check` = typecheck + `node --test` (pure logic in `src/core.js`). Keep it fast; no cargo in it.
- `npm run dev` / `npm run build` = Tauri (needs Rust). Build caches live in `11-05/tmp/cargo-home` and `11-05/tmp/cargo-target` (set CARGO_HOME / CARGO_TARGET_DIR) — deletable, disk is tight.

## Rules
- NEVER commit copyrighted sounds: the real meows in `../cat-clock/assets/sounds/meow-*.wav` come from other people's videos (private use only). `.gitignore` blocks `meow-*.wav`. Private sounds are loaded at runtime from the user's app-data `sounds/` folder.
- Cat art = the user's own Gemini-generated images (OK to publish).
- Verify in the real running app (screenshots / real mouse via `../../tools/drop-test.ps1`-style scripts); use a scratch settings file for tests, never the user's real one.
- macOS can't be run here: rely on the GitHub Actions macOS build + say clearly what was not tested.

## Layout
- `src/core.js` pure logic (zones, awake, alarms, settings validation + migration from the old C# settings.json) — `tests/core.test.js`
- `src/assets/` sprite frames (`cat-<name>-walk|run|lie-<n>.png`, `cat-<name>.txt` / `-lie.txt` layout data), `sounds/purr.wav`

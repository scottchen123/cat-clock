// @ts-check
// Sounds (Web Audio): a synthesized meow (fawn lower, lilac higher), a two-note chime, and a purr loop
// (assets/sounds/purr.wav, CC0). Private meow recordings can replace the synthesized one: put
// meow-<cat>-1.wav, meow-<cat>-2.wav ... in the "sounds" folder next to settings.json (never shipped in the repo).
const { core } = window.__TAURI__;

/** @type {AudioContext|null} */ let ac = null;
/** last sounds played (shown with CATCLOCK_DEBUG=1) @type {string[]} */
export const log = [];
/** @param {string} what */
const note = (what) => { log.push(`${(performance.now() / 1000).toFixed(1)}s ${what}`); if (log.length > 6) log.shift(); };
function ctx() {
  if (!ac) ac = new AudioContext();
  if (ac.state === "suspended") ac.resume().catch(() => {});
  return ac;
}
/** The first click anywhere unlocks audio on systems that need a user gesture. */
export function unlock() { ctx(); }

const RATE = 22050;
/** @param {Float32Array} s */
function buffer(s) { const b = ctx().createBuffer(1, s.length, RATE); b.copyToChannel(/** @type {Float32Array<ArrayBuffer>} */ (s), 0); return b; }
/** @param {AudioBuffer} b @param {number} [vol] */
function play(b, vol = 1) {
  const c = ctx(), src = c.createBufferSource(), g = c.createGain();
  src.buffer = b; g.gain.value = vol; src.connect(g).connect(c.destination); src.start();
  return src;
}

/** Synthesized meow: rises, then falls; a few harmonics. @param {number} pitch 1 = normal */
function synthMeow(pitch) {
  const len = 0.55 / Math.sqrt(pitch), s = new Float32Array(Math.round(RATE * len));
  let ph = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / RATE, x = t / len;
    const f = (520 + 380 * Math.sin(Math.PI * Math.min(1, x * 1.25))) * pitch;
    ph += 2 * Math.PI * f / RATE;
    const env = Math.sin(Math.PI * x) * (x < 0.08 ? x / 0.08 : 1);
    let v = 0; for (let k = 1; k <= 5; k++) v += Math.sin(k * ph) / (k * (k === 2 ? 0.7 : 1));
    s[i] = 0.22 * env * v;
  }
  return buffer(s);
}

function synthChime() {
  const notes = [1318.5, 1046.5], len = 0.55, gap = 0.28, s = new Float32Array(Math.round(RATE * (gap + len)));
  notes.forEach((n, j) => {
    const start = Math.round(j * gap * RATE);
    for (let i = 0; start + i < s.length; i++) {
      const t = i / RATE, env = Math.exp(-t * 6) * Math.min(1, t * 200);
      s[start + i] += 0.32 * env * (Math.sin(2 * Math.PI * n * t) + 0.3 * Math.sin(4 * Math.PI * n * t));
    }
  });
  return buffer(s);
}

/** @type {Record<string, AudioBuffer[]>} */ const meows = {};
/** @type {AudioBuffer|null} */ let chime = null;
/** @type {AudioBuffer|null} */ let purr = null;
/** @type {AudioBufferSourceNode|null} */ let purrNode = null;

/** Load the purr file and any private meows. Call once at start. */
export async function load() {
  try {
    const r = await fetch("assets/sounds/purr.wav");
    purr = await ctx().decodeAudioData(await r.arrayBuffer());
  } catch (e) { console.error("purr", e); }
  for (const cat of ["fawn", "lilac"]) {
    meows[cat] = [];
    for (let n = 1; n <= 9; n++) {
      try {
        const bytes = /** @type {ArrayBuffer} */ (await core.invoke("read_private_sound", { name: `meow-${cat}-${n}.wav` }));
        if (!bytes || !bytes.byteLength) break;
        meows[cat].push(await ctx().decodeAudioData(bytes));
      } catch { break; }
    }
  }
}

/** @param {string} cat "fawn" | "lilac" */
export function meow(cat) {
  note("meow " + cat);
  const own = meows[cat];
  if (own && own.length) { play(own[Math.floor(Math.random() * own.length)]); return; }
  const key = "synth-" + cat;
  if (!meows[key]) meows[key] = [synthMeow(cat === "fawn" ? 0.82 : 1.15)];
  play(meows[key][0], 0.9);
}

export function playChime() { note("chime"); if (!chime) chime = synthChime(); play(chime, 0.9); }

/** Purr on/off (loops while petting). @param {boolean} on */
export function setPurr(on) {
  if (on !== !!purrNode) note("purr " + (on ? "on" : "off"));
  if (on && !purrNode && purr) { purrNode = play(purr, 0.8); purrNode.loop = true; }
  if (!on && purrNode) { try { purrNode.stop(); } catch { /* already stopped */ } purrNode = null; }
}

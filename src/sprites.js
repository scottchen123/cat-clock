// @ts-check
// Sprite sets made by tools/sprite_frames.py (in the old project): every frame of one cat shares the same wide canvas,
// with the cat standing in the middle.
//   cat-<name>.txt      = "DIP-per-pixel  writing-top"   (screen px per image px at size 1; where the time text starts, as a share of the height)
//   cat-<name>-lie.txt  = body drop per lie frame, as a share of the height (frame 0 = standing ... last = lying)
//   cat-<name>-walk-0..3.png, -run-0..4.png, -lie-0..6.png

/** @typedef {{ alpha: Uint8ClampedArray, w: number, h: number }} Mask */
/** @typedef {{ name: string, dip: number, textTop: number, walk: HTMLImageElement[], run: HTMLImageElement[], lie: HTMLImageElement[], lieDrop: number[] }} Sprite */

/** @param {string} src @returns {Promise<HTMLImageElement>} */
export const loadImage = (src) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error("missing " + src)); i.src = src; });

/** @param {string} url */
async function text(url) { const r = await fetch(url); if (!r.ok) throw new Error("missing " + url); return (await r.text()).trim(); }

/** Load frames until one is missing. @param {string} base e.g. "assets/cat-fawn-walk-" */
async function frames(base) {
  const out = [];
  for (let i = 0; i < 12; i++) {
    try { out.push(await loadImage(`${base}${i}.png`)); } catch { break; }
  }
  return out;
}

/** @param {string} name "fawn" | "lilac" @returns {Promise<Sprite>} */
export async function loadSprite(name) {
  const [meta, drops, walk, run, lie] = await Promise.all([
    text(`assets/cat-${name}.txt`), text(`assets/cat-${name}-lie.txt`),
    frames(`assets/cat-${name}-walk-`), frames(`assets/cat-${name}-run-`), frames(`assets/cat-${name}-lie-`),
  ]);
  const m = meta.split(/\s+/).map(Number);
  return { name, dip: m[0], textTop: m[1], walk, run, lie, lieDrop: drops.split(/\s+/).map(Number) };
}

/** @type {WeakMap<HTMLImageElement, Mask>} */
const masks = new WeakMap();

/** Small alpha mask of a frame (for "is the mouse on the cat?"). @param {HTMLImageElement} img */
export function maskOf(img) {
  let m = masks.get(img);
  if (m) return m;
  const w = 200, h = Math.round(200 * img.height / img.width);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d", { willReadFrequently: true }));
  g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data, alpha = new Uint8ClampedArray(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = d[i * 4 + 3];
  m = { alpha, w, h }; masks.set(img, m);
  return m;
}

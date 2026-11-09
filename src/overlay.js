// @ts-check
// The overlay: one transparent always-on-top window over the primary screen's work area.
// Clicks go through to the apps below, except where the mouse is over a cat (checked against the frame's alpha).
import * as C from "./core.js";
import { loadSprite } from "./sprites.js";
import { Cat } from "./cat.js";
import { Pair } from "./pair.js";
import * as Sound from "./sound.js";

const { window: W, dpi, core, event } = window.__TAURI__;
const win = W.getCurrentWindow();

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("stage"));
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));

/** Where the window sits on screen (physical px) and its scale. */
let origin = { x: 0, y: 0 }, scale = 1, areaW = 800, areaH = 600, areaKey = "";
/** @type {C.Settings} */ let S = C.defaults();
/** @type {Cat[]} */ let cats = [];
/** @type {Pair|null} */ let pair = null;
let debug = false;

const floor = () => areaH; // the work area ends at the taskbar / dock

async function fitToWorkArea() {
  const m = (await W.primaryMonitor()) || (await W.currentMonitor());
  if (!m) return;
  const wa = m.workArea || { position: m.position, size: m.size };
  const key = [wa.position.x, wa.position.y, wa.size.width, wa.size.height, m.scaleFactor].join();
  if (key === areaKey) return;
  origin = { x: wa.position.x, y: wa.position.y }; scale = m.scaleFactor;
  areaW = wa.size.width / scale; areaH = wa.size.height / scale; // use these, not innerWidth/innerHeight (they update later)
  await win.setPosition(new dpi.PhysicalPosition(wa.position.x, wa.position.y));
  await win.setSize(new dpi.PhysicalSize(wa.size.width, wa.size.height));
  areaKey = key; // only once the window really moved
  resizeCanvas();
  for (const c of cats) keepOnScreen(c);
}

function resizeCanvas() {
  const d = window.devicePixelRatio || 1;
  canvas.width = Math.round(areaW * d); canvas.height = Math.round(areaH * d);
  canvas.style.width = areaW + "px"; canvas.style.height = areaH + "px";
  ctx.setTransform(d, 0, 0, d, 0, 0);
}

// ---- settings ----
async function loadSettings() {
  try {
    const raw = /** @type {string} */ (await core.invoke("load_settings"));
    S = C.fromJson(raw ? JSON.parse(raw.replace(/^﻿/, "")) : null);
  } catch (e) {
    console.error("settings", e); S = C.defaults();
    readOnly = true; // keep the user's file as it is (hand-edit typo, locked file...) instead of replacing it with defaults
  }
}
/** @type {number|undefined} */ let saveTimer;
/** Keep a cat reachable after the screen changed. @param {Cat} c */
function keepOnScreen(c) {
  c.x = Math.max(-c.w * 0.3, Math.min(c.x, areaW - c.w * 0.7));
  if (c.y !== null) c.y = Math.max(-c.h * 0.3, Math.min(c.y, c.floorTop(floor())));
}
let readOnly = false;
export function saveSoon() {
  if (readOnly) return;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => core.invoke("save_settings", { json: JSON.stringify(S, null, 1) }).catch((e) => console.error("save", e)), 400);
}

/** Write settings now (before quitting). */
async function saveNow() {
  clearTimeout(saveTimer);
  if (!readOnly) await core.invoke("save_settings", { json: JSON.stringify(S, null, 1) }).catch((e) => console.error("save", e));
}
async function quitApp() {
  for (const c of cats) if (!c.holding) S.pos[/** @type {"fawn"|"lilac"} */ (c.name)] = { x: Math.round(c.x), y: c.y === null ? null : Math.round(c.y) };
  await saveNow();
  await core.invoke("quit");
}

// ---- cats ----
async function makeCats() {
  const want = S.cats === "both" ? ["fawn", "lilac"] : [S.cats];
  cats = [];
  for (const name of want) {
    const c = new Cat(await loadSprite(name), S.cats === "both" ? (name === "fawn" ? "A" : "B") : "");
    c.size = S.size;
    const p = S.pos[/** @type {"fawn"|"lilac"} */ (name)];
    const mid = (areaW - c.w) / 2 + (name === "lilac" && S.cats === "both" ? -Math.min(360, areaW / 4) : 0);
    c.x = p && p.x < areaW - 40 && p.x > -c.w + 40 ? p.x : mid;
    c.y = p && p.y !== null ? Math.max(-c.h * 0.3, Math.min(p.y, c.floorTop(floor()))) : null;
    if (name === "lilac") c.facing = 1; // starts out looking towards the other cat
    c.walkOn = S.walk;
    c.canChase = name === "fawn" || S.cats !== "both"; // only one cat comes over to a resting mouse
    c.onHeart = spawnHeart;
    c.onPetting = (cat, on) => { if (on && pair) pair.petted(cat); hooks.petting(cat, on); };
    cats.push(c);
  }
  pair = cats.length === 2 ? new Pair(cats[0], cats[1], { meow: (c) => hooks.meow(c), heart: spawnHeart }) : null;
}

/** Times, cities and sleep, from the clock (every half second). */
function tick() {
  const now = new Date();
  const tA = C.hhmmAt(S.zoneA, now), tB = C.hhmmAt(S.zoneB, now);
  const awakeA = C.isAwake(tA, S.awakeA[0], S.awakeA[1]), awakeB = C.isAwake(tB, S.awakeB[0], S.awakeB[1]);
  const A = { time: tA, city: S.cityA, side: /** @type {"A"} */ ("A") }, B = { time: tB, city: S.cityB, side: /** @type {"B"} */ ("B") };
  for (const c of cats) {
    c.labels = c.side === "A" ? [A] : c.side === "B" ? [B] : [A, B];
    c.asleep = c.side === "A" ? !awakeA : c.side === "B" ? !awakeB : !(awakeA && awakeB);
  }
  // alarms
  const nxt = C.next(S, now), nearCall = !!nxt && C.minutesUntil(nxt, S, now) <= 10;
  for (const c of cats) c.nearCall = nearCall; // walks a bit faster just before a call
  for (const al of C.due(S, now)) { al.lastFired = C.firedKey(al, S, now); saveSoon(); sendState(); startRing(al.label, al.side); } // the panel must see lastFired, or it would send the old one back
  if (snooze && Date.now() >= snooze.at) { const z = snooze; snooze = null; startRing(z.label, z.side); }
  if (ring) {
    const secs = (Date.now() - ring.start) / 1000;
    if (S.sound && secs < 120 && Date.now() >= ring.nextChime) {
      if (ring.chimes % 3 === 2) Sound.meow(ring.cat.name); else Sound.playChime();
      ring.chimes++; ring.nextChime = Date.now() + 2500;
    }
    if (secs > 600) stopRing();
  }
}

// ---- alarm ringing: that side's cat runs to the middle and hops, the other comes along; bubble with Stop / 5 min ----
/** @type {{ cat: Cat, label: string, side: "A"|"B", start: number, nextChime: number, chimes: number } | null} */ let ring = null;
/** @type {{ at: number, label: string, side: "A"|"B" } | null} */ let snooze = null;
const bubble = /** @type {HTMLDivElement} */ (document.getElementById("bubble"));
/** @param {string} label @param {"A"|"B"} side */
export function startRing(label, side) {
  const cat = cats.find((c) => c.side === side) || cats[0];
  if (!cat) return;
  if (ring) ring.cat.ringing = false;
  ring = { cat, label, side, start: Date.now(), nextChime: Date.now(), chimes: 0 };
  /** @type {HTMLElement} */ (document.getElementById("bubbleLabel")).textContent = label || "Reminder · 提醒";
  cat.ringing = true;
  const mid = areaW / 2, other = cats.find((c) => c !== cat);
  cat.ringTarget = mid;
  if (other && pair) other.ringTarget = mid + (other.mid < cat.mid ? -1 : 1) * pair.gap * 1.05; // stands beside it, on its own side
  bubble.style.display = "block";
}
export function stopRing() {
  if (!ring) return;
  ring.cat.ringing = false; ring = null;
  for (const c of cats) c.ringTarget = null;
  bubble.style.display = "none";
}
/** @type {HTMLElement} */ (document.getElementById("stopBtn")).onclick = () => stopRing();
bubble.addEventListener("pointerdown", () => Sound.unlock());
/** @type {HTMLElement} */ (document.getElementById("snoozeBtn")).onclick = () => {
  if (ring) snooze = { at: Date.now() + 5 * 60000, label: ring.label, side: ring.side };
  stopRing();
};
/** Keep the bubble above the ringing cat (below it when the cat is at the top of the screen). */
function placeBubble() {
  if (!ring) return;
  const c = ring.cat, bw = bubble.offsetWidth, bh = bubble.offsetHeight, top = c.top(floor()) + c.h * 0.15;
  const left = Math.max(4, Math.min(areaW - bw - 4, c.mid - bw / 2));
  bubble.style.left = left + "px";
  bubble.style.top = (top - bh - 6 < 4 ? c.top(floor()) + c.h + 6 : top - bh - 6) + "px";
}
/** Is the point on the bubble? @param {number} x @param {number} y */
function overBubble(x, y) {
  if (!ring) return false;
  const r = bubble.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

/** Cats whose person is asleep start the day lying down. */
function settleSleepers() {
  for (const c of cats) if (c.asleep) { c.resting = true; c.wantLie = true; c.lieLevel = 1; c.phaseEnd = c.clock + 20 + Math.random() * 30; }
}

/** Things later milestones plug in (sound, panel). */
export const hooks = {
  /** @param {Cat} c */ click: (c) => { if (S.sound) { Sound.setPurr(false); Sound.meow(c.name); } },
  /** @param {Cat} c */ meow: (c) => { if (S.sound && !c.asleep) Sound.meow(c.name); },
  /** @param {Cat} c */ doubleClick: (c) => openPanelNear(c),
  /** @param {Cat} _c @param {boolean} on */ petting: (_c, on) => Sound.setPurr(on && S.sound),
};

// ---- settings panel (its own window) and the tray menu ----
/** Open the panel beside the cat (logical screen px). @param {Cat} c */
function openPanelNear(c) {
  const top = c.top(floor()), sx = origin.x / scale, sy = origin.y / scale;
  const PW = 460, PH = 780; // panel size incl. title bar
  const x = Math.max(0, Math.min(areaW - PW, c.mid - PW / 2)), above = top - PH;
  const y = above >= 0 ? above : Math.max(0, Math.min(areaH - PH, top + c.h)); // above the cat, else below it, else as high as fits
  core.invoke("open_panel", { x: sx + x, y: sy + y }).catch(console.error);
}
/** Apply settings changed in the panel. @param {any} patch */
async function applyPatch(patch) {
  if (!loaded) return; // the panel might still show defaults
  const before = { cats: S.cats, size: S.size };
  const fired = new Map(S.alarms.map((a) => [a.time + a.side, a.lastFired]));
  S = C.fromJson({ ...S, ...patch, pos: S.pos }); // positions stay the overlay's business
  for (const a of S.alarms) a.lastFired = fired.get(a.time + a.side) || ""; // when an alarm last rang is the overlay's business too
  const z = snooze;
  if (z && !S.alarms.some((a) => a.on && a.label === z.label && a.side === z.side)) snooze = null; // its reminder was deleted or turned off
  saveSoon();
  if (before.cats !== S.cats || before.size !== S.size) {
    stopRing();
    for (const c of cats) S.pos[/** @type {"fawn"|"lilac"} */ (c.name)] = { x: Math.round(c.x), y: c.y === null ? null : Math.round(c.y) };
    await makeCats(); settleSleepers();
  }
  for (const c of cats) c.walkOn = S.walk;
  if (!S.sound) Sound.setPurr(false);
  tick(); sendState();
}
let loaded = false;
function sendState() { if (loaded) event.emit("settings-state", { ...S, canSave: !readOnly }).catch(console.error); }
event.listen("panel-ready", () => sendState());
event.listen("settings-patch", (e) => { applyPatch(e.payload).catch(console.error); });
event.listen("test-alarm", () => startRing("Test · 测试", cats[0] && cats[0].side === "B" ? "B" : "A"));
event.listen("tray", (e) => {
  if (e.payload === "home") { for (const c of cats) { c.y = null; S.pos[/** @type {"fawn"|"lilac"} */ (c.name)] = { x: Math.round(c.x), y: null }; } saveSoon(); }
  if (e.payload === "pause" || e.payload === "resume") for (const c of cats) c.paused = e.payload === "pause";
  if (e.payload === "quit") quitApp().catch(console.error);
});
event.listen("quit", () => quitApp().catch(console.error));

// ---- hearts ----
/** @type {{ x: number, y: number, age: number, drift: number, size: number }[]} */
const hearts = [];
/** @param {Cat} c */
function spawnHeart(c) {
  const h = c.head(floor());
  hearts.push({ x: h.x + (Math.random() * 30 - 15) * c.size, y: h.y - 22 * c.size, age: 0, drift: Math.random() * 6, size: (16 + Math.random() * 8) * c.size });
}
/** @param {number} dt */
function drawHearts(dt) {
  for (let i = hearts.length - 1; i >= 0; i--) {
    const h = hearts[i]; h.age += dt; h.y -= 38 * dt;
    const life = h.age / 1.5;
    if (life >= 1) { hearts.splice(i, 1); continue; }
    ctx.save();
    ctx.globalAlpha = life < 0.15 ? life / 0.15 : 1 - (life - 0.15) / 0.85;
    ctx.fillStyle = "#EE6E8A"; ctx.shadowColor = "white"; ctx.shadowBlur = 6;
    ctx.font = `${h.size}px "Segoe UI Symbol", "Apple Symbols", sans-serif`; ctx.textAlign = "center";
    ctx.fillText("♥", h.x + Math.sin(h.age * 4 + h.drift) * 6, h.y);
    ctx.restore();
  }
}

// ---- mouse on a cat: click, double click, drag, petting ----
/** @type {{ cat: Cat, x0: number, y0: number, id: number } | null} */ let press = null;
let lastClickAt = 0, lastMove = { x: 0, y: 0 };
canvas.addEventListener("pointerdown", (e) => {
  Sound.unlock();
  if (e.button !== 0) return;
  const c = catAt(e.clientX, e.clientY);
  if (!c) return;
  press = { cat: c, x0: e.clientX, y0: e.clientY, id: e.pointerId };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  const dist = Math.hypot(e.clientX - lastMove.x, e.clientY - lastMove.y); lastMove = { x: e.clientX, y: e.clientY };
  if (press) {
    if (e.buttons === 0) { endPress(e); return; } // the release was missed (alt-tab, Win key...)
    const c = press.cat;
    if (!c.holding && Math.abs(e.clientX - press.x0) + Math.abs(e.clientY - press.y0) > 4) {
      c.pickUp(press.x0, press.y0, floor());
      cats.splice(cats.indexOf(c), 1); cats.push(c); // the held cat is drawn on top
    }
    if (c.holding) { c.x = e.clientX - c.grab.x; c.y = e.clientY - c.grab.y; }
    return;
  }
  const c = catAt(e.clientX, e.clientY);
  if (c && dist < 80) c.rub(dist);
});
/** @param {PointerEvent} e */
function endPress(e) {
  if (!press) return;
  const c = press.cat; press = null;
  try { canvas.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  if (c.holding) {
    c.drop(floor()); keepOnScreen(c);
    S.pos[/** @type {"fawn"|"lilac"} */ (c.name)] = { x: Math.round(c.x), y: c.y === null ? null : Math.round(c.y) };
    saveSoon();
    return;
  }
  if (e.type !== "pointerup") return;
  const now = performance.now();
  if (now - lastClickAt < 450) { lastClickAt = 0; hooks.doubleClick(c); return; }
  lastClickAt = now;
  if (ring) { stopRing(); return; } // clicking the cat stops the alarm
  c.hop(); hooks.click(c);
  if (pair) pair.clicked(c);
}
canvas.addEventListener("pointerup", endPress);
canvas.addEventListener("pointercancel", endPress);
canvas.addEventListener("lostpointercapture", endPress);
addEventListener("blur", () => { if (press) endPress(new PointerEvent("pointercancel")); });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// cats wander: remember where they are now and then (a dropped cat is saved at once)
setInterval(() => {
  let changed = false;
  for (const c of cats) {
    const p = S.pos[/** @type {"fawn"|"lilac"} */ (c.name)], x = Math.round(c.x);
    if (!c.holding && (!p || Math.abs(p.x - x) > 30)) { S.pos[/** @type {"fawn"|"lilac"} */ (c.name)] = { x, y: c.y === null ? null : Math.round(c.y) }; changed = true; }
  }
  if (changed) saveSoon();
}, 20000);

// ---- drawing ----
let last = performance.now();
function frame() {
  const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
  const area = { width: areaW, floor: floor() };
  for (const c of cats) c.update(dt, area);
  if (pair) pair.direct(dt, floor());
  ctx.clearRect(0, 0, areaW, areaH);
  for (const c of cats) c.draw(ctx, floor());
  drawHearts(dt);
  placeBubble();
  if (debug) {
    const t = `area ${areaW}x${areaH} inner ${innerWidth}x${innerHeight} dpr ${devicePixelRatio} scale ${scale} canvas ${canvas.width}x${canvas.height} | ` +
      cats.map((c) => `${c.name} x${Math.round(c.x)} top${Math.round(c.top(floor()))} f${c.facing} lie${c.lieLevel.toFixed(1)} ${pair ? pair.s(c).mode || "-" : ""}`).join(" | ");
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 1100, 40); ctx.fillStyle = "#ff0"; ctx.font = "13px monospace"; ctx.fillText(t, 4, 14);
    ctx.fillText(`now ${(performance.now() / 1000).toFixed(1)}s | ring ${ring ? "on" : "off"} | sounds: ${Sound.log.join(" · ")}`, 4, 32);
  }
  requestAnimationFrame(frame);
}

// ---- click-through: follow the global cursor ----
let ignoring = true;
/** The cat under the point (top-most first). @param {number} x @param {number} y */
export function catAt(x, y) { for (let i = cats.length - 1; i >= 0; i--) if (cats[i].hit(x, y, floor())) return cats[i]; return null; }
let cursor = { x: -1, y: -1 }, cursorStill = 0, cursorAt = performance.now();
async function pollCursor() {
  try {
    const p = await W.cursorPosition();
    const cx = (p.x - origin.x) / scale, cy = (p.y - origin.y) / scale, now = performance.now();
    if (Math.hypot(cx - cursor.x, cy - cursor.y) > 4) { cursor = { x: cx, y: cy }; cursorStill = 0; } else cursorStill += (now - cursorAt) / 1000;
    cursorAt = now;
    const over = catAt(cx, cy);
    for (const c of cats) {
      c.hover = c === over;
      // a mouse resting near the floor for a moment makes the chasing cat walk over
      const nearFloor = cy > floor() - c.h - 160 && cy <= floor() + 60;
      c.restingCursorX = nearFloor && cursorStill > 1.2 && cursorStill < 30 ? cx : null;
    }
    const hit = !!over || !!press || overBubble(cx, cy); // while a cat is held the window keeps the mouse
    if (hit === ignoring) { await win.setIgnoreCursorEvents(!hit); ignoring = !hit; } // state changes only once the window did
  } catch (e) { console.error(e); }
  setTimeout(pollCursor, 40);
}

async function main() {
  try {
    debug = /** @type {boolean} */ (await core.invoke("debug_flag"));
    await fitToWorkArea();
    await loadSettings();
    loaded = true; sendState(); // a panel opened early gets the real settings
    await makeCats();
    await Sound.load().catch((e) => console.error("sounds", e));
    tick(); settleSleepers(); setInterval(tick, 500);
    setInterval(() => fitToWorkArea().catch(console.error), 3000); // taskbar/dock moved, resolution or scale changed
  } catch (e) { console.error("start", e); }
  await win.setIgnoreCursorEvents(true).catch(console.error);
  await win.show(); // even if something failed above, never stay invisible
  requestAnimationFrame(frame);
  pollCursor();
}
main().catch((e) => console.error(e));

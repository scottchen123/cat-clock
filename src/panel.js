// @ts-check
// Settings panel window: edits a copy of the settings and sends each change to the overlay ("settings-patch"),
// which owns, applies and saves them. Every change is saved at once (no Save button).
import * as C from "./core.js";

const { event, core } = window.__TAURI__;
const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const input = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ ($(id));
const select = (/** @type {string} */ id) => /** @type {HTMLSelectElement} */ ($(id));

/** @type {C.Settings|null} */ let S = null;

/** @param {Partial<C.Settings>} patch */
function send(patch) {
  if (!S) return;
  Object.assign(S, patch);
  event.emit("settings-patch", patch).catch(console.error);
  const s = $("saved"); s.classList.add("on"); clearTimeout(savedTimer); if (canSave) savedTimer = window.setTimeout(() => s.classList.remove("on"), 1200);
  render();
}
/** @type {number|undefined} */ let savedTimer;

// ---- zones list (the user's own zone is kept even if it is not in the list) ----
/** @param {HTMLSelectElement} sel @param {string} zone */
function fillZones(sel, zone) {
  const list = C.ZONES.map(([city, z]) => [z, `${z.replace(/_/g, " ")} (${city})`]);
  const seen = new Set();
  sel.innerHTML = "";
  for (const [z, label] of list) {
    if (seen.has(z)) continue; seen.add(z);
    sel.add(new Option(label, z));
  }
  if (!seen.has(zone)) sel.add(new Option(zone.replace(/_/g, " "), zone));
  sel.value = zone;
}

// ---- status line ----
function status() {
  if (!S) return;
  const now = new Date();
  const tA = C.hhmmAt(S.zoneA, now), tB = C.hhmmAt(S.zoneB, now);
  const upA = C.isAwake(tA, ...S.awakeA), upB = C.isAwake(tB, ...S.awakeB);
  $("status").textContent = `${S.cityA} ${tA} · ${S.cityB} ${tB} · ${C.diffText(S.cityA, S.zoneA, S.zoneB, now)}`;
  const nx = C.next(S, now);
  $("next").textContent = (upA && upB ? "✓ Good time to talk · 适合聊天" : !upA && !upB ? "☾ Both asleep · 都在睡觉" : `☾ ${upA ? S.cityB : S.cityA} is asleep · 在睡觉`) +
    (nx ? `  ·  ⏰ Next: ${nx.label || "Reminder"} ${C.untilText(C.minutesUntil(nx, S, now))}` : "  ·  ⏰ No reminders on · 没有提醒");
}

// ---- reminders ----
function renderAlarms() {
  if (!S) return;
  const ul = $("alarms"); ul.innerHTML = "";
  if (!S.alarms.length) { const li = document.createElement("li"); li.className = "empty"; li.textContent = "No reminders yet · 还没有提醒"; ul.append(li); }
  S.alarms.forEach((a, i) => {
    const li = document.createElement("li"); if (!a.on) li.className = "off";
    const t = document.createElement("span"); t.className = "time"; t.textContent = a.time;
    const w = document.createElement("span"); w.className = "what";
    w.append(a.label || "Reminder · 提醒", " "); const sm = document.createElement("small"); sm.textContent = `(${C.cityOf(a, /** @type {C.Settings} */ (S))} time)`; w.append(sm);
    const on = document.createElement("input"); on.type = "checkbox"; on.checked = a.on; on.title = "On / off 开 / 关";
    on.onchange = () => { const list = /** @type {C.Settings} */ (S).alarms.slice(); list[i] = { ...list[i], on: on.checked }; send({ alarms: list }); };
    const del = document.createElement("button"); del.className = "del"; del.textContent = "×"; del.title = "Delete 删除";
    del.onclick = () => { const list = /** @type {C.Settings} */ (S).alarms.filter((_, j) => j !== i); send({ alarms: list }); };
    li.append(t, w, on, del); ul.append(li);
  });
}
$("aAdd").onclick = () => {
  if (!S) return;
  const t = C.normalize(input("aTime").value);
  if (!t) { $("msg").textContent = "Time like 21:00 · 请按 21:00 格式"; return; }
  $("msg").textContent = "";
  const side = select("aSide").value === "B" ? "B" : "A";
  const list = [...S.alarms, { time: t, side: /** @type {"A"|"B"} */ (side), label: input("aLabel").value.trim().slice(0, 60) || "Call", on: true, lastFired: "" }];
  list.sort((x, y) => C.toMin(x.time) - C.toMin(y.time));
  input("aLabel").value = "";
  send({ alarms: list });
};

// ---- cities, awake hours ----
for (const side of ["A", "B"]) {
  const city = input("city" + side), zone = select("zone" + side);
  city.onchange = () => { if (city.value.trim()) send(/** @type {any} */ ({ ["city" + side]: city.value.trim() })); };
  zone.onchange = () => send(/** @type {any} */ ({ ["zone" + side]: zone.value }));
  const a1 = input(`aw${side}1`), a2 = input(`aw${side}2`);
  const save = () => {
    const f = C.normalize(a1.value), t = C.normalize(a2.value);
    if (!f || !t) { $("msg").textContent = "Please write times like 08:00 · 请按 08:00 格式填写"; return; }
    $("msg").textContent = "";
    send(/** @type {any} */ ({ ["awake" + side]: [f, t] }));
  };
  a1.onchange = save; a2.onchange = save;
}

// ---- segmented buttons ----
/** @param {string} id @param {(v: string) => Partial<C.Settings>} toPatch */
function seg(id, toPatch) { for (const b of $(id).querySelectorAll("button")) b.onclick = () => send(toPatch(/** @type {string} */ (b.dataset.v))); }
seg("cats", (v) => ({ cats: /** @type {"both"|"fawn"|"lilac"} */ (v) }));
seg("size", (v) => ({ size: Number(v) }));
seg("sound", (v) => ({ sound: v === "true" }));
seg("walk", (v) => ({ walk: v === "true" }));
/** @param {string} id @param {string} value */
function pressed(id, value) { for (const b of $(id).querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.v === value)); }

$("test").onclick = () => event.emit("test-alarm").catch(console.error);
$("quit").onclick = () => event.emit("quit").catch(console.error); // the overlay saves first, then quits

function render() {
  if (!S) return;
  const active = document.activeElement;
  for (const side of ["A", "B"]) {
    const city = input("city" + side), zone = select("zone" + side);
    if (active !== city) city.value = side === "A" ? S.cityA : S.cityB;
    if (active !== zone) fillZones(zone, side === "A" ? S.zoneA : S.zoneB);
    const aw = side === "A" ? S.awakeA : S.awakeB;
    if (active !== input(`aw${side}1`)) input(`aw${side}1`).value = aw[0];
    if (active !== input(`aw${side}2`)) input(`aw${side}2`).value = aw[1];
    $("aw" + side).textContent = side === "A" ? S.cityA : S.cityB;
  }
  const sideSel = select("aSide"), keep = sideSel.value || "A";
  sideSel.innerHTML = ""; sideSel.add(new Option(`${S.cityA} time`, "A")); sideSel.add(new Option(`${S.cityB} time`, "B")); sideSel.value = keep;
  pressed("cats", S.cats); pressed("size", String(S.size)); pressed("sound", String(S.sound)); pressed("walk", String(S.walk));
  renderAlarms(); status();
}

let canSave = true;
// listen first, then ask (otherwise the answer could come before the listener exists)
event.listen("settings-state", (e) => {
  S = C.fromJson(e.payload); canSave = /** @type {any} */ (e.payload).canSave !== false;
  $("saved").textContent = canSave ? "Saved ✓ 已保存" : "Can't save settings · 无法保存设置";
  if (!canSave) $("saved").classList.add("on");
  render();
}).then(() => event.emit("panel-ready")).catch(console.error);
setInterval(status, 5000);
export {};

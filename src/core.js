// @ts-check
// Pure logic (no DOM, no Tauri): time zones, awake hours, alarms, settings validation + migration.
// Ported from the C#/WPF app (apps/cat-clock/pet/Core.cs). Tested by tests/core.test.js.

/** @typedef {{ time: string, side: "A"|"B", label: string, on: boolean, lastFired: string }} Alarm */
/** @typedef {{ x: number, y: number|null }} Pos  y null = sitting on the floor (taskbar / dock line) */
/**
 * @typedef {{
 *   cityA: string, zoneA: string, cityB: string, zoneB: string,
 *   awakeA: [string, string], awakeB: [string, string],
 *   sound: boolean, walk: boolean, size: number, cats: "both"|"lilac"|"fawn",
 *   pos: { fawn: Pos|null, lilac: Pos|null }, alarms: Alarm[]
 * }} Settings
 */

/** Cities offered in the panel (any IANA zone works in settings.json). */
export const ZONES = [
  ["Shanghai", "Asia/Shanghai"], ["Beijing", "Asia/Shanghai"], ["Hong Kong", "Asia/Hong_Kong"], ["Taipei", "Asia/Taipei"],
  ["Tokyo", "Asia/Tokyo"], ["Seoul", "Asia/Seoul"], ["Singapore", "Asia/Singapore"], ["Sydney", "Australia/Sydney"],
  ["Rijswijk", "Europe/Amsterdam"], ["The Hague", "Europe/Amsterdam"], ["Amsterdam", "Europe/Amsterdam"], ["Berlin", "Europe/Berlin"],
  ["Paris", "Europe/Paris"], ["London", "Europe/London"], ["New York", "America/New_York"], ["Toronto", "America/Toronto"],
  ["Chicago", "America/Chicago"], ["Los Angeles", "America/Los_Angeles"], ["Vancouver", "America/Vancouver"],
];

/** Windows zone ids used by the old C# app -> IANA (for importing an old settings.json). */
const WIN_ZONES = {
  "China Standard Time": "Asia/Shanghai", "W. Europe Standard Time": "Europe/Amsterdam", "Romance Standard Time": "Europe/Paris",
  "GMT Standard Time": "Europe/London", "Eastern Standard Time": "America/New_York", "Central Standard Time": "America/Chicago",
  "Pacific Standard Time": "America/Los_Angeles", "AUS Eastern Standard Time": "Australia/Sydney",
  "Tokyo Standard Time": "Asia/Tokyo", "Singapore Standard Time": "Asia/Singapore",
};

/** @param {string} zone */
export function validZone(zone) {
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; }
}

/**
 * Wall-clock parts of `date` in `zone`.
 * @param {string} zone @param {Date} date
 */
export function partsAt(zone, date) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  /** @type {Record<string, string>} */ const p = {};
  for (const x of f.formatToParts(date)) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}`, hour: +p.hour, minute: +p.minute };
}

/** "HH:MM" of `date` in `zone`. @param {string} zone @param {Date} date */
export function hhmmAt(zone, date) { return partsAt(zone, date).hhmm; }

/** @param {string} hhmm @returns {number} minutes after midnight, -1 if invalid */
export function toMin(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || "").trim());
  if (!m) return -1;
  const h = +m[1], mi = +m[2];
  return h > 23 || mi > 59 ? -1 : h * 60 + mi;
}

/** @param {string} hhmm @returns {string|null} "07:05" or null */
export function normalize(hhmm) {
  const m = toMin(hhmm);
  return m < 0 ? null : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Minutes zone A is ahead of zone B at `date` (negative = behind). @param {string} a @param {string} b @param {Date} date */
export function aheadMinutes(a, b, date) {
  const pa = partsAt(a, date), pb = partsAt(b, date);
  const da = Date.UTC(+pa.date.slice(0, 4), +pa.date.slice(5, 7) - 1, +pa.date.slice(8), pa.hour, pa.minute);
  const db = Date.UTC(+pb.date.slice(0, 4), +pb.date.slice(5, 7) - 1, +pb.date.slice(8), pb.hour, pb.minute);
  return Math.round((da - db) / 60000);
}

/** @param {string} nameA @param {string} a @param {string} b @param {Date} date */
export function diffText(nameA, a, b, date) {
  const d = aheadMinutes(a, b, date);
  if (d === 0) return "Same time";
  const x = Math.abs(d);
  return `${nameA} is ${Math.floor(x / 60)}h${x % 60 ? ` ${x % 60}m` : ""} ${d > 0 ? "ahead" : "behind"}`;
}

/** Is hh:mm inside [from, to)? Windows crossing midnight work (22:00–02:00). Invalid or empty window = awake. */
/** @param {string} hhmm @param {string} from @param {string} to */
export function isAwake(hhmm, from, to) {
  const t = toMin(hhmm), a = toMin(from), b = toMin(to);
  if (t < 0 || a < 0 || b < 0 || a === b) return true;
  return a < b ? t >= a && t < b : t >= a || t < b;
}

/** @param {Alarm} al @param {Settings} s */
export const zoneOf = (al, s) => (al.side === "B" ? s.zoneB : s.zoneA);
/** @param {Alarm} al @param {Settings} s */
export const cityOf = (al, s) => (al.side === "B" ? s.cityB : s.cityA);

/** Minutes until the alarm next rings (0..1439). @param {Alarm} al @param {Settings} s @param {Date} date */
export function minutesUntil(al, s, date) {
  const p = partsAt(zoneOf(al, s), date);
  const d = toMin(al.time) - (p.hour * 60 + p.minute);
  return ((d % 1440) + 1440) % 1440;
}

/** @param {Alarm} al @param {Settings} s @param {Date} date */
export const firedKey = (al, s, date) => `${partsAt(zoneOf(al, s), date).date} ${al.time}`;

/** Alarms whose minute has come and that have not rung for it yet. @param {Settings} s @param {Date} date */
export function due(s, date) {
  return s.alarms.filter((al) => al.on && toMin(al.time) >= 0 && hhmmAt(zoneOf(al, s), date) === al.time && al.lastFired !== firedKey(al, s, date));
}

/** @param {Settings} s @param {Date} date @returns {Alarm|null} */
export function next(s, date) {
  const on = s.alarms.filter((a) => a.on && toMin(a.time) >= 0);
  on.sort((x, y) => minutesUntil(x, s, date) - minutesUntil(y, s, date));
  return on[0] || null;
}

/** @param {number} min */
export function untilText(min) {
  if (min <= 0) return "now";
  if (min < 60) return `in ${min} min`;
  return `in ${Math.floor(min / 60)}h ${min % 60}m`;
}

/** @returns {Settings} */
export function defaults() {
  return {
    cityA: "Shanghai", zoneA: "Asia/Shanghai", cityB: "Rijswijk", zoneB: "Europe/Amsterdam",
    awakeA: ["08:00", "23:00"], awakeB: ["08:00", "23:00"],
    sound: true, walk: true, size: 0.75, cats: "both",
    pos: { fawn: null, lilac: null },
    alarms: [
      { time: "21:00", side: "A", label: "Video call", on: true, lastFired: "" },
      { time: "22:30", side: "A", label: "Good night message", on: true, lastFired: "" },
    ],
  };
}

/** @param {unknown} v @returns {Pos|null} */
function pos(v) {
  if (!v || typeof v !== "object") return null;
  const o = /** @type {any} */ (v);
  if (typeof o.x !== "number" || !isFinite(o.x)) return null;
  return { x: o.x, y: typeof o.y === "number" && isFinite(o.y) ? o.y : null };
}

/**
 * Turn whatever was in settings.json (new format, old C# format, broken values) into valid Settings.
 * @param {any} raw @returns {Settings}
 */
export function fromJson(raw) {
  const d = defaults();
  if (!raw || typeof raw !== "object") return d;
  /** @type {any} */ let r = raw;
  if ("NameB" in r || "ZoneB" in r || "AwakeA1" in r) r = migrateOld(r);
  const str = (/** @type {any} */ v, /** @type {string} */ f) => (typeof v === "string" && v.trim() ? v.trim() : f);
  const zone = (/** @type {any} */ v, /** @type {string} */ f) => (typeof v === "string" && validZone(v) ? v : f);
  const win = (/** @type {any} */ v, /** @type {[string,string]} */ f) =>
    /** @type {[string,string]} */ (Array.isArray(v) && normalize(v[0]) && normalize(v[1]) ? [normalize(v[0]), normalize(v[1])] : f);
  const s = {
    cityA: str(r.cityA, d.cityA), zoneA: zone(r.zoneA, d.zoneA), cityB: str(r.cityB, d.cityB), zoneB: zone(r.zoneB, d.zoneB),
    awakeA: win(r.awakeA, d.awakeA), awakeB: win(r.awakeB, d.awakeB),
    sound: typeof r.sound === "boolean" ? r.sound : d.sound, walk: typeof r.walk === "boolean" ? r.walk : d.walk,
    size: typeof r.size === "number" && r.size >= 0.4 && r.size <= 1.5 ? r.size : d.size,
    cats: r.cats === "lilac" || r.cats === "fawn" ? r.cats : "both",
    pos: { fawn: pos(r.pos && r.pos.fawn), lilac: pos(r.pos && r.pos.lilac) },
    alarms: Array.isArray(r.alarms) ? r.alarms.map(alarm).filter(Boolean) : d.alarms,
  };
  return /** @type {Settings} */ (s);
}

/** @param {any} a @returns {Alarm|null} */
function alarm(a) {
  if (!a || typeof a !== "object") return null;
  const t = normalize(a.time);
  if (!t) return null;
  return { time: t, side: a.side === "B" ? "B" : "A", label: typeof a.label === "string" ? a.label.slice(0, 60) : "", on: a.on !== false, lastFired: typeof a.lastFired === "string" ? a.lastFired : "" };
}

/** Old C# settings.json (NameB, ZoneB as Windows ids, AwakeA1/2, Top/Left...) -> new shape. @param {any} o */
function migrateOld(o) {
  const floor = (/** @type {any} */ t) => typeof t !== "number" || t === -1 || t <= -50000;
  return {
    cityA: "Shanghai", zoneA: "Asia/Shanghai",
    cityB: o.NameB, zoneB: WIN_ZONES[/** @type {keyof typeof WIN_ZONES} */ (o.ZoneB)] || "Europe/Amsterdam",
    awakeA: [o.AwakeA1, o.AwakeA2], awakeB: [o.AwakeB1, o.AwakeB2],
    sound: o.Sound, walk: o.Walk, size: o.Size, cats: o.Cat,
    // old: main window = fawn (Top/Left), companion = lilac (Top2/Left2). The old window had 104 px of
    // alarm-bubble space above the cat picture and 20 px of margin on its left.
    pos: {
      fawn: typeof o.Left === "number" && o.Left !== -1 ? { x: o.Left + 20, y: floor(o.Top) ? null : o.Top + 104 } : null,
      lilac: typeof o.Left2 === "number" && o.Left2 !== -1 ? { x: o.Left2 + 20, y: floor(o.Top2) ? null : o.Top2 + 104 } : null,
    },
    alarms: (o.Alarms || []).map((/** @type {any} */ a) => ({ time: a.Time, side: a.Side, label: a.Label, on: a.On, lastFired: a.LastFired })),
  };
}

/** Drop rule: released within `snap` px above the floor line -> sit on the floor (null), else stay at y. */
/** @param {number} y top of the cat @param {number} floorY top of the cat when on the floor @param {number} [snap] */
export function dropY(y, floorY, snap = 25) { return y > floorY - snap ? null : y; }

// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../src/core.js";

const U = (/** @type {number[]} */ ...a) => new Date(Date.UTC(a[0], a[1] - 1, a[2], a[3], a[4]));
const SH = "Asia/Shanghai", NL = "Europe/Amsterdam";

test("time zones: Shanghai vs Rijswijk, winter and summer", () => {
  assert.equal(C.aheadMinutes(SH, NL, U(2026, 11, 6, 12, 0)), 420);
  assert.equal(C.aheadMinutes(SH, NL, U(2026, 7, 1, 12, 0)), 360);
  assert.equal(C.diffText("Shanghai", SH, NL, U(2026, 11, 6, 12, 0)), "Shanghai is 7h ahead");
  assert.equal(C.diffText("Shanghai", SH, SH, U(2026, 11, 6, 12, 0)), "Same time");
  assert.equal(C.diffText("Delhi", "Asia/Kolkata", "Europe/London", U(2026, 1, 6, 12, 0)), "Delhi is 5h 30m ahead");
  assert.equal(C.hhmmAt(SH, U(2026, 11, 6, 12, 0)), "20:00");
  assert.equal(C.hhmmAt(NL, U(2026, 11, 6, 12, 0)), "13:00");
});

test("awake windows", () => {
  assert.equal(C.isAwake("08:00", "08:00", "23:00"), true);
  assert.equal(C.isAwake("23:00", "08:00", "23:00"), false);
  assert.equal(C.isAwake("01:00", "22:00", "02:00"), true);
  assert.equal(C.isAwake("03:00", "22:00", "02:00"), false);
  assert.equal(C.isAwake("03:00", "bad", "02:00"), true);
});

test("time parsing", () => {
  assert.equal(C.normalize("7:05"), "07:05");
  assert.equal(C.normalize("24:00"), null);
  assert.equal(C.normalize("ab"), null);
  assert.equal(C.untilText(0), "now");
  assert.equal(C.untilText(5), "in 5 min");
  assert.equal(C.untilText(125), "in 2h 5m");
});

test("alarms: due once per day in their own zone, next", () => {
  const s = C.defaults();
  s.alarms = [{ time: "21:00", side: "A", label: "Video call", on: true, lastFired: "" }, { time: "09:30", side: "B", label: "Morning", on: true, lastFired: "" }];
  const at = U(2026, 11, 6, 13, 0); // 21:00 Shanghai, 14:00 Rijswijk
  assert.deepEqual(C.due(s, at).map((a) => a.label), ["Video call"]);
  s.alarms[0].lastFired = C.firedKey(s.alarms[0], s, at);
  assert.equal(C.due(s, at).length, 0, "fires once");
  assert.equal(C.due(s, U(2026, 11, 7, 13, 0)).length, 1, "fires again next day");
  s.alarms[1].time = "14:00";
  assert.equal(C.due(s, at).map((a) => a.label).join(), "Morning", "side B uses Rijswijk time");
  s.alarms[1].on = false;
  assert.equal(C.next(s, U(2026, 11, 6, 12, 0))?.label, "Video call");
  assert.equal(C.minutesUntil(s.alarms[0], s, U(2026, 11, 6, 12, 0)), 60);
});

test("settings: defaults, broken values, old C# file migrates", () => {
  assert.equal(C.fromJson(null).cityB, "Rijswijk");
  const bad = C.fromJson({ zoneA: "Mars/Base", size: 99, cats: "dog", awakeA: ["25:00", "x"], alarms: [{ time: "nope" }, { time: "7:00", side: "B" }] });
  assert.equal(bad.zoneA, "Asia/Shanghai");
  assert.equal(bad.size, 0.75);
  assert.equal(bad.cats, "both");
  assert.deepEqual(bad.awakeA, ["08:00", "23:00"]);
  assert.deepEqual(bad.alarms.map((a) => a.time + a.side), ["07:00B"]);
  const old = C.fromJson({ NameB: "London", ZoneB: "GMT Standard Time", AwakeA1: "07:00", AwakeA2: "22:00", AwakeB1: "08:00", AwakeB2: "23:00", Sound: false, Walk: true, Size: 0.6, Cat: "both", Top: -100000, Left: 900, Top2: 27, Left2: 800, Alarms: [{ Time: "21:00", Side: "A", Label: "Call", On: true, LastFired: "" }] });
  assert.equal(old.cityB, "London");
  assert.equal(old.zoneB, "Europe/London");
  assert.deepEqual(old.awakeA, ["07:00", "22:00"]);
  assert.equal(old.sound, false);
  assert.deepEqual(old.pos, { fawn: { x: 920, y: null }, lilac: { x: 820, y: 131 } }, "old window -> picture position");
  assert.equal(old.alarms[0].label, "Call");
});

test("drop: high up stays (also negative y), near the floor sits on it", () => {
  assert.equal(C.dropY(-9, 700), -9);
  assert.equal(C.dropY(300, 700), 300);
  assert.equal(C.dropY(690, 700), null);
});

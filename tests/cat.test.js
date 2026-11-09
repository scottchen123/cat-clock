// @ts-check
// Behaviour of one cat and of the pair, with fake sprites (no browser needed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { Cat } from "../src/cat.js";
import { Pair } from "../src/pair.js";

const img = /** @type {HTMLImageElement} */ (/** @type {unknown} */ ({ width: 1000, height: 700 }));
/** @param {string} name */
const sprite = (name) => ({ name, dip: 0.43, textTop: 0.4, walk: [img, img, img, img], run: [img, img, img, img, img], lie: [img, img, img, img, img, img, img], lieDrop: [0, 0.03, 0.07, 0.1, 0.12, 0.29, 0.31] });
const AREA = { width: 1920, floor: 1040 };
/** @param {Cat} c @param {number} secs */
const run = (c, secs) => { for (let t = 0; t < secs; t += 0.05) c.update(0.05, AREA); };

test("a cat that can't wander still sleeps and wakes with its person", () => {
  const c = new Cat(sprite("fawn"), "A"); c.walkOn = false;
  c.asleep = true; run(c, 2);
  assert.equal(c.lieLevel, 1, "lies down");
  c.asleep = false; run(c, 2);
  assert.equal(c.lieLevel, 0, "gets up");
  const high = new Cat(sprite("lilac"), "B"); high.y = 200; high.asleep = true; run(high, 2);
  assert.equal(high.lieLevel, 1, "also when placed up high");
});

test("drop: high up stays, near the floor sits on it", () => {
  const c = new Cat(sprite("fawn"), "A");
  c.pickUp(500, 400, AREA.floor); c.y = 150; c.drop(AREA.floor);
  assert.equal(c.y, 150);
  c.pickUp(500, 900, AREA.floor); c.y = c.floorTop(AREA.floor) - 10; c.drop(AREA.floor);
  assert.equal(c.y, null);
});

test("walking cats on the same floor never overlap", () => {
  const a = new Cat(sprite("fawn"), "A"), b = new Cat(sprite("lilac"), "B");
  const p = new Pair(a, b, { meow: () => {}, heart: () => {} });
  a.x = 900; b.x = 600; a.facing = -1; b.facing = 1;
  for (let t = 0; t < 120; t += 0.05) {
    a.update(0.05, AREA); b.update(0.05, AREA); p.direct(0.05, AREA.floor);
    assert.ok(Math.abs(a.mid - b.mid) >= p.gap * 0.97 - 0.01, `overlap at ${t.toFixed(2)} s: ${Math.abs(a.mid - b.mid).toFixed(1)} < ${(p.gap * 0.97).toFixed(1)}`);
  }
});

test("zoomies make the other cat chase without crashing", () => {
  const a = new Cat(sprite("fawn"), "A"), b = new Cat(sprite("lilac"), "B");
  const p = new Pair(a, b, { meow: () => {}, heart: () => {} });
  a.x = 1200; b.x = 400; p.clock = 1; p.greetCool = 99; // far apart, no greeting in the way
  b.resting = true; b.wantLie = false; b.phaseEnd = 99; // the other cat is standing, awake
  a.resting = false; a.phaseEnd = 99; a.clock = 1; a.dashStart = 1; a.dashEnd = 3; // a starts its zoomies
  const rnd = Math.random;
  try {
    Math.random = () => 0.1; // the chase starts with a 70 % chance: make it happen
    p.direct(0.05, AREA.floor);
    assert.equal(p.s(b).mode, "chase");
    for (let t = 0; t < 4; t += 0.05) { a.update(0.05, AREA); b.update(0.05, AREA); p.direct(0.05, AREA.floor); }
  } finally { Math.random = rnd; }
  assert.ok(Math.abs(a.mid - b.mid) < 1000, "b ran after a");
});

// @ts-check
// One cat: where it is, what it does (wander, rest, lie down, dash, hop, dangle) and how it is drawn
// (photo + the time written on its body). Ported from the WPF app (Pet.cs OnFrame/Frames, Life.cs).
import { maskOf } from "./sprites.js";

/** @typedef {import("./sprites.js").Sprite} Sprite */

const BODY_W = 250;          // width of the walking cat itself (screen px at size 1) inside the wide sprite canvas
const RUN_SPEED = 380;       // px/s at size 1; one bound ~ 0.55 body lengths, so the paws don't slide
const RUN_START_T = 0.14, BOUND_T = 0.36;
const HOP_UP = 0.13, HOP_DOWN = 0.47, HOP_END = 0.56;
const COLORS = { A: ["#A85A30", "#7A5A42"], B: ["#5E5880", "#5E5A72"] }; // [time, city] per side
const FONT = '"Segoe UI", "Microsoft YaHei UI", "PingFang SC", -apple-system, system-ui, sans-serif';
const smooth = (/** @type {number} */ t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

export class Cat {
  /** @param {Sprite} sprite @param {"A"|"B"|""} side "" = one cat for both people (shows both times) */
  constructor(sprite, side) {
    this.sprite = sprite; this.side = side;
    this.x = 0;               // left edge of the sprite canvas (CSS px)
    /** @type {number|null} */ this.y = null; // top edge; null = standing on the floor
    this.facing = -1;         // the photo faces left (-1); 1 = mirrored
    this.size = 0.75;
    /** @type {{ time: string, city: string, side: "A"|"B" }[]} */ this.labels = [];
    this.asleep = false; this.nearCall = false;
    this.ringing = false;     // its alarm is ringing: runs to the middle and hops
    /** @type {number|null} */ this.ringTarget = null; // where to stand during an alarm (centre x), also for the other cat
    this.walkOn = true;       // settings: cats may walk around
    this.paused = false;      // tray: "pause walking"
    this.hover = false;       // the mouse is on this cat
    // motion
    this.clock = 0; this.speed = 0; this.bobY = 0;
    this.resting = true; this.phaseEnd = 1 + Math.random() * 3; this.dashStart = 0; this.dashEnd = 0;
    this.lieLevel = 0; this.wantLie = false;
    this.gait = 0; this.running = false; this.runT = 0; this.landUntil = -9;
    // touch
    this.hopStart = -9; this.landStart = -9;
    this.holding = false; this.grab = { x: 0, y: 0 }; // grab point, relative to the sprite canvas (unflipped px)
    this.swing = 0; this.swingVel = 0; this.vxs = 0; this.lastX = 0; this.hang = 1;
    this.petTravel = 0; this.petUntil = -9; this.nextHeart = 0;
    // chase: walk over to a mouse that rests near the floor (main cat only)
    this.canChase = false; this.chasing = false; this.chaseDone = false; this.chaseX = 0;
    /** set by the overlay: x of a resting cursor near the floor, or null */
    this.restingCursorX = /** @type {number|null} */ (null);
    /** @type {(cat: Cat) => void} */ this.onHeart = () => {};
    /** @type {(cat: Cat, on: boolean) => void} */ this.onPetting = () => {};
    /** extra steering from pair play (Pair.js): returns true when it moved the cat this frame */
    /** @type {null | ((cat: Cat, dt: number) => boolean)} */ this.steer = null;
    /** @type {null | ((cat: Cat, dx: number) => boolean)} */ this.blocked = null;
  }

  get name() { return this.sprite.name; }
  get w() { return this.sprite.walk[0].width * this.sprite.dip * this.size; }
  get h() { return this.sprite.walk[0].height * this.sprite.dip * this.size; }
  get bodyW() { return BODY_W * this.size; }
  get mid() { return this.x + this.w / 2; }
  get petting() { return this.clock < this.petUntil; }
  get canRun() { return this.sprite.run.length >= 5; }
  get runSpeed() { return RUN_SPEED * this.size; }
  /** top edge when standing on the floor @param {number} floor y of the floor line */
  floorTop(floor) { return floor - 5 - this.h; }
  /** @param {number} floor */
  top(floor) { return this.y === null ? this.floorTop(floor) : this.y; }

  /** current lie frame index (0 = standing) */
  get lieIndex() { const n = this.sprite.lie.length; return n >= 3 ? Math.round(this.lieLevel * (n - 1)) : 0; }
  /** how far the body has sunk (px) */
  get lieDrop() { const d = this.sprite.lieDrop; return this.h * (d[this.lieIndex] ?? 0); }

  // ---------- frames ----------
  /** The frame to show now. */
  frame() {
    const s = this.sprite, t = this.clock - this.hopStart;
    if (this.canRun && t >= 0 && t < HOP_END) return s.run[t < HOP_UP ? 0 : t < 0.2 ? 2 : t < 0.4 ? 3 : 4]; // crouch, push off, fly, land
    const li = this.lieIndex;
    if (li > 0) return s.lie[li];
    if (this.runFrame >= 0) return s.run[this.runFrame];
    if (this.speed > 0 && s.walk.length) return s.walk[Math.floor(this.gait * s.walk.length) % s.walk.length];
    return s.walk[0];
  }
  runFrame = -1;

  /** Legs: walk cycle by distance travelled (no sliding paws); run = start frame, then bounds. @param {number} dt */
  legs(dt) {
    this.runFrame = -1;
    if (this.speed >= 100 && this.canRun) {
      if (!this.running) { this.running = true; this.runT = 0; }
      this.runT += dt;
      if (this.runT < RUN_START_T) this.runFrame = 1;
      else {
        const p = ((this.runT - RUN_START_T) % BOUND_T) / BOUND_T;
        this.runFrame = p < 0.25 ? 2 : p < 0.72 ? 3 : 4;
        this.bobY = this.runFrame === 3 ? -Math.sin(Math.PI * (p - 0.25) / 0.47) * 10 * this.size : 0;
      }
      return;
    }
    if (this.running && this.canRun) { this.running = false; this.landUntil = this.clock + 0.12; }
    if (this.clock < this.landUntil) { this.runFrame = 4; this.bobY = 0; return; }
    if (this.speed > 0) {
      const cycle = Math.max(30 * this.size, this.speed * 0.32);
      this.gait += this.speed * dt / cycle;
      this.bobY = -Math.abs(Math.sin(this.gait * 2 * Math.PI)) * 1.2 * this.size; // body rises a little on each step
    }
  }

  // ---------- every frame ----------
  /** @param {number} dt seconds @param {{ width: number, floor: number }} area */
  update(dt, area) {
    this.clock += dt;
    this.speed = 0; this.bobY = 0;
    if (this.holding) {
      this.lieLevel = 0; this.wantLie = false; this.chasing = false;
      this.swingStep(dt);
      return;
    }
    if (this.asleep !== this.wasAsleep) { // the person just fell asleep / woke up
      this.wasAsleep = this.asleep;
      this.resting = true; this.wantLie = this.asleep;
      this.phaseEnd = this.clock + (this.asleep ? 25 + Math.random() * 40 : 2 + Math.random() * 3);
    }
    const ring = this.ringTarget !== null;
    if (ring) this.wantLie = false;
    const lieTarget = this.wantLie ? 1 : 0, lieRate = ring ? 4 : 0.9; // jumps up for an alarm
    this.lieLevel = this.lieLevel < lieTarget ? Math.min(lieTarget, this.lieLevel + lieRate * dt) : Math.max(lieTarget, this.lieLevel - lieRate * dt);
    const down = this.lieLevel > 0;
    const edge = Math.max(20, (this.w - this.bodyW) / 2 - 10); // the wide sprite canvas may hang over the screen edge
    const minX = -edge, maxX = area.width - this.w + edge;
    const onFloor = this.y === null;

    if (ring) {
      const d = onFloor && !down ? /** @type {number} */ (this.ringTarget) - this.mid : 0;
      if (Math.abs(d) > 3) { // run over (bounds), walk the last bit
        this.facing = d < 0 ? -1 : 1; this.speed = Math.abs(d) > 60 ? this.runSpeed : 60;
        this.x += this.facing * Math.min(this.speed * dt, Math.abs(d));
      } else if (this.ringing && !down) this.bobY = -Math.abs(Math.sin(this.clock * 9)) * 4; // then hops in place
    } else if (this.hover) {
      this.bobY = Math.sin(this.clock * 1.8) * 0.7; // stops to look at the mouse
    } else if (this.paused || !this.walkOn || !onFloor) {
      this.wantLie = this.asleep; // can't wander: just sleeps when its person sleeps
      this.bobY = Math.sin(this.clock * 1.8) * 0.7; // breathing (cats placed up high stay where you put them)
    } else if (this.steer && this.steer(this, dt)) {
      // pair play moved it
    } else if (this.chase(dt, minX, maxX)) {
      // walking over to the mouse
    } else {
      if (this.clock >= this.phaseEnd) this.nextPhase();
      if (this.resting || down) this.bobY = Math.sin(this.clock * 1.8) * 0.7;
      else {
        let speed = this.asleep ? 11 : this.nearCall ? 55 : 24;
        if (this.clock < this.dashEnd) { // zoomies: speed up over 0.25 s, slow down over the last 0.3 s
          const env = Math.min(smooth((this.clock - this.dashStart) / 0.25), smooth((this.dashEnd - this.clock) / 0.3));
          speed += (this.runSpeed - speed) * env;
        }
        this.speed = speed;
        const dx = this.facing * speed * dt;
        if (this.blocked && this.blocked(this, dx)) { this.facing = -this.facing; this.dashEnd = 0; } // never walk through the other cat
        else this.x += dx;
        if (this.x < minX) { this.x = minX; this.facing = 1; }
        if (this.x > maxX) { this.x = maxX; this.facing = -1; }
      }
    }
    this.x = Math.max(minX, Math.min(maxX, this.x));
    this.legs(dt);
    // click hop: up in the air while the leap frames play
    const ht = this.clock - this.hopStart;
    if (ht > HOP_UP && ht < HOP_DOWN) this.bobY -= Math.sin(Math.PI * (ht - HOP_UP) / (HOP_DOWN - HOP_UP)) * 26 * this.size;
    // petting: stroking adds up travel, which fades; hearts while petted
    this.petTravel = Math.max(0, this.petTravel - 120 * dt);
    if (this.petting && this.clock >= this.nextHeart) { this.nextHeart = this.clock + 0.45; this.onHeart(this); }
    if (!this.petting && this.wasPetting) this.onPetting(this, false);
    this.wasPetting = this.petting;
    this.swingStep(dt);
  }
  wasPetting = false;
  wasAsleep = false;

  nextPhase() {
    if (this.resting) { // get up and walk (asleep: only a short stroll)
      this.resting = false; this.wantLie = false;
      this.phaseEnd = this.clock + (this.asleep ? 4 + Math.random() * 5 : 6 + Math.random() * 10);
      if (Math.random() < 0.2) this.facing = -this.facing;
      this.dashStart = this.clock;
      this.dashEnd = !this.asleep && this.canRun && Math.random() < 0.15 ? this.clock + 0.9 + Math.random() * 0.8 : 0;
    } else { // stop; sometimes lie down (almost always when asleep)
      this.resting = true; this.wantLie = this.asleep ? Math.random() < 0.9 : Math.random() < 0.45;
      this.phaseEnd = this.clock + (this.wantLie ? (this.asleep ? 25 + Math.random() * 40 : 8 + Math.random() * 12) : 2 + Math.random() * 4);
    }
  }

  /** Walk over to a mouse that rests near the floor. @param {number} dt @param {number} minX @param {number} maxX */
  chase(dt, minX, maxX) {
    const raw = this.restingCursorX, cx = raw === null ? null : Math.max(minX + this.w / 2, Math.min(maxX + this.w / 2, raw));
    if (cx === null) { this.chasing = false; this.chaseDone = false; return false; }
    if (!this.canChase || this.asleep) { this.chasing = false; return false; }
    const dx = cx - this.mid;
    if (!this.chasing && !this.chaseDone && Math.abs(dx) > 60 * this.size && Math.abs(dx) < 900) { this.chasing = true; this.chaseX = cx; }
    if (!this.chasing) return false;
    this.resting = false; this.wantLie = false;
    if (this.lieLevel > 0) return true; // getting up first
    const d = this.chaseX - this.mid;
    if (Math.abs(d) < 10) { // arrived: sit and look at it for a while
      this.chasing = false; this.chaseDone = true; this.resting = true;
      this.phaseEnd = this.clock + 5 + Math.random() * 6;
      return false;
    }
    this.facing = d < 0 ? -1 : 1;
    this.speed = Math.abs(d) > 320 ? this.runSpeed : 60; // runs while far, walks the last bit
    this.x += this.facing * Math.min(this.speed * dt, Math.abs(d));
    return true;
  }

  /** Held: hangs from the grab point like a pendulum (damped spring on the drag speed); settles after a drop. @param {number} dt */
  swingStep(dt) {
    const vx = dt > 0 ? (this.x - this.lastX) / dt : 0; this.lastX = this.x;
    this.vxs = this.holding ? this.vxs + (vx - this.vxs) * Math.min(1, dt * 8) : 0;
    const target = Math.max(-18, Math.min(18, this.vxs * 0.035));
    this.swingVel += ((target - this.swing) * 45 - this.swingVel * 5) * dt;
    this.swing += this.swingVel * dt;
    this.hang += ((this.holding ? 1.06 : 1) - this.hang) * Math.min(1, dt * 8); // legs hang a little longer
  }

  // ---------- touch ----------
  /** Single click: hop (unless lying) + heart. */
  hop() {
    if (this.lieLevel < 0.05) { this.hopStart = this.clock; this.landStart = this.clock + HOP_DOWN; }
    this.onHeart(this);
  }
  /** Mouse moved over the cat by `dist` px; enough rubbing = petting. @param {number} dist */
  rub(dist) {
    if (this.holding) return;
    this.petTravel += dist;
    if (this.petTravel > 160) {
      this.petTravel = 160;
      if (!this.petting) { this.nextHeart = this.clock; this.onPetting(this, true); }
      this.petUntil = this.clock + 1.2;
    }
  }
  /** Picked up at a point on screen. @param {number} px @param {number} py @param {number} floor */
  pickUp(px, py, floor) {
    const top = this.top(floor);
    this.holding = true; this.y = top;
    this.grab = { x: px - this.x, y: py - top };
    this.lastX = this.x; this.resting = true; this.chasing = false;
  }
  /** Put down: stays where it is; close to the floor it sits on the floor. @param {number} floor */
  drop(floor) {
    this.holding = false;
    if (this.y !== null && this.y > this.floorTop(floor) - 25) this.y = null;
    this.landStart = this.clock; // small squash as the paws touch down
    this.phaseEnd = this.clock + 2 + Math.random() * 3;
  }

  /** Head position on screen (for hearts). @param {number} floor */
  head(floor) {
    const u = this.facing < 0 ? 0.27 : 0.73;
    return { x: this.x + this.w * u, y: this.top(floor) + this.h * 0.4 + this.lieDrop + this.bobY };
  }

  /** Is the point on an opaque pixel of the cat? @param {number} px @param {number} py @param {number} floor */
  hit(px, py, floor) {
    const img = this.frame(), x0 = this.x, y0 = this.top(floor) + this.bobY;
    let u = (px - x0) / this.w; const v = (py - y0) / this.h;
    if (u < 0 || v < 0 || u >= 1 || v >= 1) return false;
    if (this.facing > 0) u = 1 - u;
    const m = maskOf(img);
    return m.alpha[Math.floor(v * m.h) * m.w + Math.floor(u * m.w)] > 40;
  }

  // ---------- drawing ----------
  /** @param {CanvasRenderingContext2D} g @param {number} floor */
  draw(g, floor) {
    const x = this.x, y0 = this.top(floor), w = this.w, h = this.h, k = this.size, cx = x + w / 2;
    // soft shadow on the floor (none while held or placed up high)
    if (this.y === null && !this.holding) {
      const sw = this.bodyW * 0.78, sh = 14 * k, sy = y0 + h - 2, a = 0.27 * (1 - 0.6 * this.lieLevel) * (1 + this.bobY / 30);
      const grad = g.createRadialGradient(cx, sy, 0, cx, sy, sw / 2);
      grad.addColorStop(0, `rgba(0,0,0,${Math.max(0, a)})`); grad.addColorStop(1, "rgba(0,0,0,0)");
      g.save(); g.translate(cx, sy); g.scale(1, sh / sw); g.translate(-cx, -sy);
      g.fillStyle = grad; g.beginPath(); g.arc(cx, sy, sw / 2, 0, Math.PI * 2); g.fill(); g.restore();
    }
    const y = y0 + this.bobY;
    g.save();
    // body transforms: landing squash (around the paws), hanging stretch + swing (around the grab point)
    const lt = this.clock - this.landStart, sq = lt >= 0 && lt < 0.25 ? Math.sin(Math.PI * lt / 0.25) : 0;
    if (sq) { g.translate(cx, y + h); g.scale(1 + 0.035 * sq, 1 - 0.07 * sq); g.translate(-cx, -(y + h)); }
    if (this.holding || Math.abs(this.swing) > 0.05 || this.hang > 1.001) {
      const gx = x + this.grab.x, gy = y + this.grab.y;
      g.translate(gx, gy); g.rotate(this.swing * Math.PI / 180); g.scale(1, this.hang); g.translate(-gx, -gy);
    }
    g.save();
    g.globalAlpha = this.asleep ? 0.86 : 1;
    if (this.facing > 0) { g.translate(x + w, y); g.scale(-1, 1); g.drawImage(this.frame(), 0, 0, w, h); }
    else g.drawImage(this.frame(), x, y, w, h);
    g.restore();
    this.drawTimes(g, cx, y + h * this.sprite.textTop + this.lieDrop);
    if (this.asleep) this.drawZz(g, cx, y);
    g.restore();
  }

  /** the time(s) written on the body; they sink with the body when it lies down */
  /** @param {CanvasRenderingContext2D} g @param {number} cx @param {number} ty */
  drawTimes(g, cx, ty) {
    const k = this.size;
    const cols = this.labels.map((l) => {
      g.font = `bold ${30 * k}px ${FONT}`; const tw = g.measureText(l.time).width;
      g.font = `bold ${13 * k}px ${FONT}`; const nw = g.measureText(l.city).width;
      return { ...l, width: Math.max(tw, nw) };
    });
    const gap = 19 * k, total = cols.reduce((s, c) => s + c.width, 0) + gap * (cols.length - 1);
    let left = cx - total / 2;
    g.save();
    g.textAlign = "center"; g.textBaseline = "top"; g.shadowColor = "white"; g.shadowBlur = 7;
    cols.forEach((c, i) => {
      const mid = left + c.width / 2, [tc, nc] = COLORS[c.side];
      for (let pass = 0; pass < 2; pass++) { // twice = a stronger white glow, readable on any fur colour
        g.fillStyle = tc; g.font = `bold ${30 * k}px ${FONT}`; g.fillText(c.time, mid, ty);
        g.fillStyle = nc; g.font = `bold ${13 * k}px ${FONT}`; g.fillText(c.city, mid, ty + 38 * k);
      }
      if (i < cols.length - 1) { g.shadowBlur = 0; g.fillStyle = "rgba(154,134,112,0.43)"; g.fillRect(left + c.width + gap / 2, ty + 5 * k, 1, 44 * k); g.shadowBlur = 7; }
      left += c.width + gap;
    });
    g.restore();
  }

  /** "z z z" just above the head (the head is on the side the cat faces) */
  /** @param {CanvasRenderingContext2D} g @param {number} cx @param {number} y */
  drawZz(g, cx, y) {
    const k = this.size;
    g.save();
    g.globalAlpha = 0.55 + 0.45 * Math.sin(this.clock * 2.2);
    g.fillStyle = "#8E86B8"; g.font = `italic bold ${20 * k}px ${FONT}`; g.textAlign = "center"; g.textBaseline = "bottom";
    g.shadowColor = "white"; g.shadowBlur = 6; // readable on dark and light desktops
    const zx = cx + (this.facing < 0 ? -1 : 1) * this.bodyW * 0.42, zy = y + this.h * 0.2 + this.lieDrop - 4 * k + Math.sin(this.clock * 2) * 3;
    g.fillText("z z z", zx, zy); g.fillText("z z z", zx, zy);
    g.restore();
  }
}

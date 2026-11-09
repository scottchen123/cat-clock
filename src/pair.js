// @ts-check
// The two cats together: they notice each other. Ported from the WPF app (Pair.cs).
//  - meet while walking -> stop nose to nose, a heart, one hops; then one walks off
//  - one has the zoomies -> the other runs after it, and they greet when it stops
//  - one lies down -> the other sometimes comes over and lies down next to it
//  - now and then one walks over to say hi
//  - click one -> the other turns to look (sometimes hops too); pet one -> the other comes over
//  - the two bodies never overlap on the same floor
/** @typedef {import("./cat.js").Cat} Cat */

/** @typedef {{ mode: ""|"greet"|"follow"|"chase", start: number, end: number, heartDone: boolean, walkOff: boolean }} PairState */

export class Pair {
  /** @param {Cat} a @param {Cat} b @param {{ meow: (c: Cat) => void, heart: (c: Cat) => void }} fx */
  constructor(a, b, fx) {
    this.a = a; this.b = b; this.fx = fx;
    /** @type {Map<Cat, PairState>} */
    this.st = new Map([a, b].map((c) => [c, { mode: "", start: 0, end: 0, heartDone: false, walkOff: false }]));
    this.greetCool = 4; this.nextRoll = 10; this.seenDash = new Map([[a, -1], [b, -1]]); // first hello can come soon after start
    this.clock = 0;
    for (const c of [a, b]) {
      c.steer = (cat, dt) => this.move(cat, dt);
      c.blocked = (cat) => this.blocked(cat);
    }
  }

  /** @param {Cat} c */ other(c) { return c === this.a ? this.b : this.a; }
  /** @param {Cat} c */ s(c) { return /** @type {PairState} */ (this.st.get(c)); }
  /** -1/1: which way the other cat is @param {Cat} c */ toward(c) { return this.other(c).mid > c.mid ? 1 : -1; }
  /** centre distance when the noses just touch (a little more than the body width: heads must not overlap) */
  get gap() { return (this.a.bodyW + this.b.bodyW) * 0.5 * 1.08; }
  /** both standing on the floor line */ get sameFloor() { return this.a.y === null && this.b.y === null; }
  /** bodies at about the same height (they would overlap when passing) @param {number} floor */
  nearFloor(floor) {
    const pa = this.a.top(floor) + this.a.h, pb = this.b.top(floor) + this.b.h;
    return Math.abs(pa - pb) < Math.min(this.a.h, this.b.h) * 0.6;
  }
  floor = 0;
  /** free to play: not held, not told to stay, mouse not on it, not walking to the mouse, no alarm @param {Cat} c */
  free(c) { return !c.holding && !c.paused && c.walkOn && !c.hover && !c.chasing && !c.ringing && c.y === null; }

  // ---------- director: once per frame, after both cats moved ----------
  /** @param {number} dt @param {number} floor */
  direct(dt, floor) {
    this.clock += dt; this.floor = floor;
    const { a, b } = this;
    this.keepApart(a); this.keepApart(b);
    if (!this.free(a) || !this.free(b) || !this.sameFloor) return;
    if (this.s(a).mode || this.s(b).mode) return;
    const dist = Math.abs(b.mid - a.mid);

    // zoomies: the other one runs after it
    for (const [me, p] of [[a, b], [b, a]]) {
      if (me.clock < me.dashEnd && me.dashStart !== this.seenDash.get(me)) {
        this.seenDash.set(me, me.dashStart);
        if (!p.asleep && p.lieLevel === 0 && Math.random() < 0.7) this.startChase(p);
        return;
      }
    }
    // bumping into each other while walking -> say hello
    const upA = a.lieLevel === 0 && !a.resting, upB = b.lieLevel === 0 && !b.resting;
    const facingEach = a.facing === this.toward(a) || b.facing === this.toward(b);
    if (this.clock > this.greetCool && dist < this.gap * 1.12 && (upA || upB) && a.lieLevel === 0 && b.lieLevel === 0 && facingEach) { this.startGreet(); return; }

    if (this.clock < this.nextRoll) return;
    this.nextRoll = this.clock + 7 + Math.random() * 6;
    const who = Math.random() < 0.5 ? a : b, other = this.other(who);
    if (other.lieLevel > 0.9 && who.lieLevel === 0 && Math.abs(other.mid - who.mid) > this.gap * 1.3) { if (Math.random() < 0.4) this.startFollow(who); } // come and lie down next to it
    else if (!a.asleep && !b.asleep && dist > this.gap * 2 && who.lieLevel === 0 && Math.random() < 0.18) this.startFollow(who); // just go and say hi
  }

  startGreet() {
    this.greetCool = this.clock + 45 + Math.random() * 30;
    const aWalksOff = Math.random() < 0.5;
    this.beginGreet(this.a, aWalksOff); this.beginGreet(this.b, !aWalksOff);
    if (!this.a.asleep && Math.random() < 0.35) this.fx.meow(Math.random() < 0.5 ? this.a : this.b); // either says hello
    const hopper = Math.random() < 0.5 ? this.a : this.b; // one of them is happy about it
    if (hopper.lieLevel === 0) { hopper.hopStart = hopper.clock + 1.3; hopper.landStart = hopper.hopStart + 0.47; }
  }
  /** @param {Cat} c @param {boolean} walkOff */
  beginGreet(c, walkOff) {
    Object.assign(this.s(c), { mode: "greet", start: c.clock, end: c.clock + 3.2 + Math.random() * 1.2, heartDone: false, walkOff });
    c.resting = true; c.wantLie = false; c.dashEnd = 0; c.facing = this.toward(c);
  }
  /** @param {Cat} c */
  startFollow(c) { Object.assign(this.s(c), { mode: "follow", start: c.clock, end: c.clock + 25 }); c.resting = false; c.wantLie = false; c.dashEnd = 0; }
  /** @param {Cat} c */
  startChase(c) {
    Object.assign(this.s(c), { mode: "chase", start: c.clock, end: c.clock + 6 }); c.resting = false; c.wantLie = false;
    const p = this.other(c); p.dashEnd = Math.max(p.dashEnd, p.clock + 2.2); // a proper chase, not a 1 s sprint
  }
  /** @param {Cat} c */
  endGreet(c) {
    const st = this.s(c); st.mode = "";
    if (st.walkOff) { c.resting = false; c.facing = -this.toward(c); c.phaseEnd = c.clock + 5 + Math.random() * 6; c.dashStart = c.clock; c.dashEnd = 0; }
    else { c.resting = true; c.wantLie = Math.random() < 0.3; c.phaseEnd = c.clock + 3 + Math.random() * 5; }
  }

  // ---------- each cat: true while a pair action moves it (Cat.update calls this) ----------
  /** @param {Cat} c @param {number} dt */
  move(c, dt) {
    const st = this.s(c), p = this.other(c);
    if (!st.mode) return false;
    if (!this.free(c) || !this.free(p) || !this.sameFloor || c.clock > st.end) {
      if (st.mode === "greet") this.endGreet(c); else st.mode = "";
      return false;
    }
    if (st.mode === "greet") {
      c.facing = this.toward(c);
      c.bobY = Math.sin(c.clock * 1.8) * 0.7;
      if (!st.heartDone && c.clock > st.start + 0.7) { st.heartDone = true; this.fx.heart(c); }
      return true;
    }
    if (c.lieLevel > 0) { c.wantLie = false; return true; } // stand up first
    let d, speed;
    if (st.mode === "follow") {
      const gap = this.gap * (p.lieLevel > 0.5 ? 1.12 : 1);
      d = p.mid - this.toward(c) * gap - c.mid;
      if (Math.abs(d) < 6) { // arrived
        st.mode = ""; c.facing = this.toward(c);
        if (p.lieLevel > 0.5) { // cuddle: lie down too, for about as long as the other
          c.resting = true; c.wantLie = true; c.phaseEnd = c.clock + 15 + Math.random() * 20; this.fx.heart(c);
          p.phaseEnd = Math.max(p.phaseEnd, p.clock + 12);
        } else if (p.lieLevel === 0 && !this.s(p).mode) this.startGreet();
        else { c.resting = true; c.phaseEnd = c.clock + 4 + Math.random() * 4; }
        return false;
      }
      c.facing = d < 0 ? -1 : 1;
      speed = Math.abs(d) > 350 ? 70 : 38;
    } else { // chase: stay just behind the running cat (on its own side); when it stops, say hello
      if (p.clock >= p.dashEnd && Math.abs(p.mid - c.mid) < this.gap * 2.5) { st.mode = ""; this.startGreet(); return false; }
      d = p.mid - this.toward(c) * this.gap * 1.1 - c.mid;
      c.facing = Math.abs(d) > 4 ? (d < 0 ? -1 : 1) : this.toward(c);
      speed = Math.abs(d) > 70 ? c.runSpeed : Math.abs(d) > 4 ? 60 : 0;
    }
    c.speed = speed;
    c.x += c.facing * Math.min(speed * dt, Math.abs(d));
    return true;
  }

  /** Walking into the other cat (same floor, heading its way, closer than nose to nose)? @param {Cat} c */
  blocked(c) {
    const p = this.other(c);
    if (!this.nearFloor(this.floor) || this.s(c).mode || c.holding || p.holding) return false;
    const gap = this.gap * (p.lieLevel > 0.5 ? 1.12 : 1);
    return c.facing === this.toward(c) && Math.abs(p.mid - c.mid) < gap;
  }

  /** The two bodies never overlap on the same floor: push this cat back out to its own side. @param {Cat} c */
  keepApart(c) {
    const p = this.other(c);
    if (!this.nearFloor(this.floor) || c.holding || p.holding) return;
    const gap = this.gap * (p.lieLevel > 0.5 || c.lieLevel > 0.5 ? 1.12 : 0.97);
    const d = c.mid - p.mid;
    if (Math.abs(d) >= gap) return;
    const side = d > 0.5 ? 1 : d < -0.5 ? -1 : (c === this.b ? -1 : 1);
    c.x = p.mid + side * gap - c.w / 2;
  }

  // ---------- reactions ----------
  /** @param {Cat} c the clicked cat */
  clicked(c) {
    const p = this.other(c);
    if (!this.free(p) || this.s(p).mode || (p.lieLevel > 0.9 && p.asleep)) return;
    if (p.lieLevel === 0) p.facing = this.toward(p); // turns to look
    if (p.lieLevel === 0 && Math.random() < 0.45) { p.hopStart = p.clock + 0.35; p.landStart = p.hopStart + 0.47; } // joins in
  }
  /** @param {Cat} c the petted cat */
  petted(c) {
    const p = this.other(c);
    if (!this.free(p) || this.s(p).mode || p.asleep || !this.sameFloor) return;
    if (Math.abs(p.mid - c.mid) > this.gap * 1.3 && Math.random() < 0.6) this.startFollow(p); // "me too!"
  }
}

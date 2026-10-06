/*
 감지. 센서 숫자를 두 가지 사실로 바꾼다.

   near    사람이 가까이 있는가
   docked  헤드셋이 거치대에 놓여 있는가

 거치대는 세 센서 각각의 판단을 따로 내서 보여 준다. 무엇을 쓸지 고르기 전에 셋을 나란히
 견줘 보려는 것이다. 실제로 쓰는 판단은 조절판의 「거치대 감지」가 고른다.

 무게와 적외선은 센서마다, 놓는 자리마다 숫자가 달라 문턱을 미리 정할 수 없다. 「비었을 때 재기」와
 「올리고 재기」로 두 값을 재 두면 그 가운데를 문턱으로 쓴다.
*/

import { DOCK_HOLD_SEC, NEAR_HOLD_SEC, SONAR_MIN_CM } from "./settings.js";

// 값이 바뀐 채로 hold 초 이어져야 받아들인다. 접점이 튀거나 손이 스칠 때 깜빡이지 않게
class Steady {
  constructor(hold, value = false) { this.hold = hold; this.value = value; this.since = null; }
  feed(v, t) {
    if (v === null || v === undefined) return this.value;
    if (v === this.value) { this.since = null; return this.value; }
    if (this.since === null) this.since = t;
    if (t - this.since >= this.hold) { this.value = v; this.since = null; }
    return this.value;
  }
}

const between = (v, a, b) => {
  // a 쪽(빈 값)과 b 쪽(올린 값) 중 어디에 가까운가. 둘 중 무엇이 큰지는 센서마다 다르다
  if (v === null || a === null || b === null || a === b) return null;
  return Math.abs(v - b) < Math.abs(v - a);
};

export class Detect {
  constructor() {
    this.near = new Steady(NEAR_HOLD_SEC);
    this.dock = new Steady(DOCK_HOLD_SEC, true);
    this.lastSeen = -1e9;   // 마지막으로 사람이 보인 때
    this.verdict = { reed: null, load: null, ir: null };
    this.raw = null;
  }

  // calib: { loadEmpty, loadFull, irEmpty, irFull } (재지 않은 것은 null)
  update(raw, t, p, calib) {
    this.raw = raw;
    if (!raw) return { near: this.near.value, docked: this.dock.value, seen: false };

    // 사람: 초음파가 가깝거나, 동작 센서가 켜졌거나
    const sonar = raw.cm !== null && raw.cm >= SONAR_MIN_CM && raw.cm <= p.nearCm;
    const pir = p.usePir && raw.pir === 1;
    const seen = sonar || pir;
    if (seen) this.lastSeen = t;
    // 들어올 때는 조금 이어져야, 나갈 때는 leaveSec 동안 안 보여야 바뀐다
    const want = seen ? true : t - this.lastSeen < p.leaveSec;
    const near = this.near.feed(want, t);

    // 거치대: 센서마다 따로 판단한다
    this.verdict = {
      reed: raw.reed === null ? null : raw.reed === 1,
      load: between(raw.load, calib.loadEmpty, calib.loadFull),
      ir: between(raw.ir, calib.irEmpty, calib.irFull),
    };
    const v = this.verdict;
    const known = [v.reed, v.load, v.ir].filter((x) => x !== null);
    const pick = p.dock === "any" ? (known.length ? known.some(Boolean) : null) : v[p.dock];
    const docked = this.dock.feed(pick, t);

    return { near, docked, seen };
  }
}

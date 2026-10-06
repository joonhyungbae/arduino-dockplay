/*
 입력. 센서 값을 받아 한 가지 꼴로 내보낸다.

   { pir, cm, reed, load, ir }   각각 숫자이거나, 그 센서를 쓰지 않으면 null

 어디서 오든 이 꼴이 같아서 뒤(detect.js, flow.js)는 그대로 돈다.
   BoardSense   아두이노 → serve.py → 여기 (EventSource)
   HandSense    화면의 단추. 보드가 없을 때 손으로 흉내 낸다
   SimSense     가짜 관객. 정해진 순서대로 저절로 다가오고 헤드셋을 들었다 놓는다
*/

import { BOARD_STALE_SEC, SIM_CYCLE } from "./settings.js";

const num = (s) => (s === "-" || s === undefined || s === "" ? null : Number(s));

export class BoardSense {
  constructor() {
    this.kind = "board";
    this.raw = { pir: null, cm: null, reed: null, load: null, ir: null };
    this.seenAt = -1e9;
    this.lines = 0;
    this.es = new EventSource("events");
    this.es.onmessage = (e) => this.line(e.data);
  }
  // S,<동작>,<거리>,<리드>,<무게>,<적외선>
  line(text) {
    const f = text.trim().split(",");
    if (f[0] !== "S" || f.length < 6) return;
    this.raw = { pir: num(f[1]), cm: num(f[2]), reed: num(f[3]), load: num(f[4]), ir: num(f[5]) };
    if (this.raw.cm !== null && this.raw.cm < 0) this.raw.cm = null;   // 메아리 없음
    this.seenAt = performance.now() / 1000;
    this.lines++;
  }
  get live() { return performance.now() / 1000 - this.seenAt < BOARD_STALE_SEC; }
  read() { return this.live ? this.raw : null; }
  stop() { this.es.close(); }
}

// 손으로 흉내 낼 때 센서들이 낼 법한 값. 무게와 적외선은 실제 보드와 숫자 범위가 다르다
export const FAKE = { loadEmpty: 0, loadFull: 52000, irEmpty: 180, irFull: 720 };
const jitter = (v, a) => v + (Math.random() - 0.5) * a;

function fake(here, docked) {
  return {
    pir: here ? 1 : 0,
    cm: here ? jitter(70, 8) : jitter(320, 10),
    reed: docked ? 1 : 0,
    load: Math.round(jitter(docked ? FAKE.loadFull : FAKE.loadEmpty, 900)),
    ir: Math.round(jitter(docked ? FAKE.irFull : FAKE.irEmpty, 20)),
  };
}

export class HandSense {
  constructor() {
    this.kind = "hand";
    this.here = false;
    this.docked = true;
  }
  read() { return fake(this.here, this.docked); }
  stop() {}
}

export class SimSense {
  constructor() {
    this.kind = "sim";
    this.t0 = performance.now() / 1000;
  }
  get t() { return (performance.now() / 1000 - this.t0) % SIM_CYCLE.length; }
  get here() { const t = this.t; return t >= SIM_CYCLE.arrive && t < SIM_CYCLE.leave; }
  get docked() { const t = this.t; return !(t >= SIM_CYCLE.lift && t < SIM_CYCLE.put); }
  read() { return fake(this.here, this.docked); }
  stop() {}
}

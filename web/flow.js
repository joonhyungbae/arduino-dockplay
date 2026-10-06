/*
 결정. 사람과 헤드셋의 움직임을 어떤 순서로 모터와 영상에 잇는가.

 이 파일이 작품의 순서다. 지금 정해 둔 것은 이렇다.

   빔      아무도 없다. 모터는 멈추고 화면은 대기 영상(또는 검은 화면)
   옴      사람이 다가왔다. 파도 장치의 모터가 돈다
   씀      헤드셋이 거치대를 떠났다. 누군가 쓰고 있다
   영상    충분히 쓴 뒤 내려놓았다. 본 영상이 처음부터 돈다
   쉼      영상이 끝났다. 잠시 다시 틀지 않는다

 바꿔 볼 만한 것: 영상 중에 사람이 떠나면 멈출까, 헤드셋을 오래 안 내려놓으면 어떻게 할까,
 두 사람이 연달아 쓰면 영상을 처음부터 다시 틀까. 아래 step() 의 줄을 고치면 된다.
*/

import { FORGOT_SEC } from "./settings.js";

export const STATES = { empty: "빔", here: "옴", worn: "씀", play: "영상", rest: "쉼" };

export class Flow {
  constructor() {
    this.state = "empty";
    this.since = 0;        // 지금 상태가 시작된 때(초)
    this.liftedAt = null;  // 헤드셋을 든 때
    this.putAt = null;     // 내려놓은 때
    this.log = [];         // 화면 오른쪽 「지나온 일」
    this.playId = 0;       // 영상을 틀 때마다 하나씩 는다. screen.js 가 이것을 보고 처음부터 튼다
    this.ended = false;    // screen.js 가 영상이 끝나면 true 로 바꾼다
  }

  go(state, t, why) {
    if (state === this.state) return;
    this.state = state;
    this.since = t;
    this.log.unshift({ t, text: `${STATES[state]} · ${why}` });
    this.log.length = Math.min(this.log.length, 40);
    if (state === "play") { this.playId++; this.ended = false; }
  }

  // s: detect.js 가 낸 { near, docked }. t: 지금(초). p: 조절판
  step(s, t, p) {
    const was = this.docked ?? s.docked;
    this.docked = s.docked;
    const lifted = was && !s.docked;
    const put = !was && s.docked;
    if (lifted) this.liftedAt = t;
    if (put) this.putAt = t;

    switch (this.state) {
      case "empty":
      case "here":
        if (!s.docked) { this.go("worn", t, "헤드셋을 들었다"); break; }
        if (s.near && this.state === "empty") this.go("here", t, "사람이 다가왔다");
        if (!s.near && this.state === "here") this.go("empty", t, "사람이 떠났다");
        break;

      case "worn":
        if (s.docked) {
          const wore = (this.putAt ?? t) - (this.liftedAt ?? t);
          if (wore < p.wearSec) { this.go(s.near ? "here" : "empty", t, `${wore.toFixed(1)}초만 들었다 놓았다`); break; }
          if (t - this.putAt >= p.settleSec) this.go("play", t, `${wore.toFixed(0)}초 쓰고 내려놓았다`);
        }
        break;

      case "play":
        if (this.ended) { this.go("rest", t, "영상이 끝났다"); break; }
        if (p.stopOnLift && !s.docked) this.go("worn", t, "영상 중에 헤드셋을 다시 들었다");
        break;

      case "rest":
        if (!s.docked) { this.go("worn", t, "헤드셋을 들었다"); break; }
        if (t - this.since >= p.restSec) this.go(s.near ? "here" : "empty", t, "쉼이 끝났다");
        break;
    }

    // 모터: 사람이 있거나 헤드셋을 쓰는 동안 돈다. 영상 중에는 조절판을 따른다
    const on = this.state === "play" ? p.motorInPlay : s.near || this.state === "worn";
    const forgot = !s.docked && this.liftedAt !== null && t - this.liftedAt > FORGOT_SEC;
    return {
      state: this.state,
      motor: on ? p.motor : 0,
      play: this.state === "play",
      playId: this.playId,
      note: forgot ? `헤드셋이 ${Math.round(t - this.liftedAt)}초째 거치대 밖에 있습니다` : "",
    };
  }
}

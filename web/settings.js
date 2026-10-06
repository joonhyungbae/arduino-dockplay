/*
 만지는 숫자는 전부 여기 있다.

 화면 오른쪽 조절판의 값은 여기 적힌 것이 처음 값이다. 조절판에서 바꾼 값은 그 브라우저에
 남아 새로 고침해도 그대로다. 이 파일의 처음 값을 고치면 남아 있던 값을 버리고 다시 시작한다.

 센서 값이 어떤 사건이 되는지는 detect.js, 사건이 어떤 순서로 영상과 모터가 되는지는 flow.js 에 있다.
*/

// ─── 조절판 ──────────────────────────────────────────────────────────────
export const PARAMS = [
  // 헤드셋이 거치대에 있는지 무엇으로 아는가. 세 센서를 다 꽂아 두고 바꿔 가며 견줄 수 있다
  { key: "dock", label: "거치대 감지", type: "select", value: "reed",
    options: [["reed", "리드 스위치"], ["load", "무게(로드셀)"], ["ir", "반사 적외선"], ["any", "셋 중 하나라도"]] },
  // 초음파가 이보다 가까운 것을 재면 사람이 온 것으로 본다
  { key: "nearCm", label: "다가옴 거리(cm)", min: 30, max: 400, step: 10, value: 150 },
  // 적외선 동작 센서도 사람으로 볼지. 끄면 초음파만 본다
  { key: "usePir", label: "동작 센서도 쓰기", type: "check", value: true },
  // 사람이 안 보인 뒤 이만큼 지나야 떠난 것으로 본다. 짧으면 가만히 선 사람도 떠난 것이 된다
  { key: "leaveSec", label: "떠났다고 볼 때까지(초)", min: 1, max: 30, step: 1, value: 6 },
  // 파도 장치 모터의 세기
  { key: "motor", label: "모터 세기", min: 0, max: 1, step: 0.05, value: 0.7 },
  // 영상이 도는 동안에도 모터를 돌릴지
  { key: "motorInPlay", label: "영상 중에도 모터", type: "check", value: true },
  // 이만큼은 들고 있어야 「써 봤다」로 본다. 스치기만 한 것으로 영상이 시작되지 않게
  { key: "wearSec", label: "써 봤다고 볼 시간(초)", min: 0, max: 20, step: 0.5, value: 3 },
  // 내려놓고 이만큼 그대로 있어야 영상을 튼다. 놓다가 다시 드는 손을 기다린다
  { key: "settleSec", label: "놓은 뒤 기다림(초)", min: 0, max: 5, step: 0.1, value: 1 },
  // 영상 중에 헤드셋을 다시 들면 영상을 멈출지. 끄면 끝까지 돈다
  { key: "stopOnLift", label: "다시 들면 영상 멈춤", type: "check", value: false },
  // 영상이 끝나고 이만큼은 다시 틀지 않는다
  { key: "restSec", label: "끝난 뒤 쉼(초)", min: 0, max: 60, step: 1, value: 5 },
  // 기다리는 동안 화면. 끄면 검은 화면으로 기다린다
  { key: "idleShow", label: "기다릴 때 대기 영상", type: "check", value: true },
  // 영상이 나타나고 사라지는 시간
  { key: "fadeSec", label: "밝아지고 어두워지는 시간(초)", min: 0, max: 5, step: 0.1, value: 1.5 },
  { key: "volume", label: "소리 크기", min: 0, max: 1, step: 0.05, value: 1 },
];

// ─── 감지 (detect.js) ────────────────────────────────────────────────────
export const DOCK_HOLD_SEC = 0.3;   // 거치대 판단이 이만큼 같은 값으로 이어져야 바뀐다. 흔들림·접점 튐을 거른다
export const NEAR_HOLD_SEC = 0.4;   // 사람이 왔다고 보려면 이만큼 이어져야 한다
export const SONAR_MIN_CM = 3;      // 이보다 가까운 값은 센서 잡음으로 버린다
export const CALIB_SEC = 1.0;       // 「재기」를 누르면 이만큼 평균을 낸다

// ─── 흐름 (flow.js) ──────────────────────────────────────────────────────
export const FORGOT_SEC = 120;      // 헤드셋이 이만큼 거치대 밖에 있으면 화면에 알린다 (지킴이용)

// ─── 보드와 주고받기 (sense.js · app.js) ─────────────────────────────────
export const BOARD_STALE_SEC = 2;   // 이만큼 줄이 안 오면 보드가 끊긴 것으로 본다
export const MOTOR_SEND_SEC = 0.25; // 모터 세기를 보내는 간격. 보드는 3초 동안 안 오면 저절로 끈다

// ─── 가짜 관객 (sense.js) ────────────────────────────────────────────────
// 한 바퀴 동안 일어나는 일(초). 다가옴 → 헤드셋 듦 → 내려놓음 → 영상 → 떠남
export const SIM_CYCLE = { arrive: 2, lift: 6, put: 12, leave: 40, length: 50 };

// ─── 화면 (screen.js) ────────────────────────────────────────────────────
export const PLACEHOLDER_SEC = 20;  // 본 영상이 없을 때 자리표시 화면이 도는 길이

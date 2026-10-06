/*
 시작하는 자리. 센서 → 감지 → 흐름 → 화면 · 모터 를 한 프레임마다 잇는다.

 주소 뒤에 붙여 쓰는 것
   ?sim          보드 없이 가짜 관객으로 시작
   ?display      조절판 없이 영상만 (전시 화면에 띄울 때)
   ?offline=40   40초를 녹화해 서버에 보내고 끝낸다 (./start.sh --offline 40 이 쓴다)
*/

import { PARAMS, CALIB_SEC, MOTOR_SEND_SEC } from "./settings.js";
import { BoardSense, HandSense, SimSense, FAKE } from "./sense.js";
import { Detect } from "./detect.js";
import { Flow, STATES } from "./flow.js";
import { Screen } from "./screen.js";

const $ = (id) => document.getElementById(id);
const url = new URLSearchParams(location.search);
const display = url.has("display");

// 조절판에서 바꾼 값은 이 브라우저에 남긴다. settings.js 의 처음 값이 바뀌었으면 남은 값을 버린다.
const STORE = "dockplay.params.v1";
const DEFAULTS = Object.fromEntries(PARAMS.map((d) => [d.key, d.value]));
const p = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || "null");
  if (saved && JSON.stringify(saved.defaults) === JSON.stringify(DEFAULTS)) Object.assign(p, saved.values);
} catch {}
const save = () => {
  try { localStorage.setItem(STORE, JSON.stringify({ defaults: DEFAULTS, values: p })); } catch {}
};

// 거치대를 맞춘 값. 보드의 숫자라서 따로 남긴다
const CALIB = "dockplay.calib.v1";
let calib = { loadEmpty: null, loadFull: null, irEmpty: null, irFull: null };
try { Object.assign(calib, JSON.parse(localStorage.getItem(CALIB) || "{}")); } catch {}
const saveCalib = () => { try { localStorage.setItem(CALIB, JSON.stringify(calib)); } catch {} };

/* ---------- 조절판 ---------- */

function buildPanel() {
  const box = $("params");
  box.innerHTML = "";
  for (const d of PARAMS) {
    const row = document.createElement("label");
    row.className = "param";
    let input;
    if (d.type === "select") {
      input = document.createElement("select");
      for (const [v, t] of d.options) input.add(new Option(t, v));
      input.value = p[d.key];
    } else {
      input = document.createElement("input");
      if (d.type === "check") { input.type = "checkbox"; input.checked = !!p[d.key]; }
      else { input.type = "range"; Object.assign(input, { min: d.min, max: d.max, step: d.step }); input.value = p[d.key]; }
    }
    const out = document.createElement("output");
    const show = () => (out.textContent = d.type ? "" : Number(p[d.key]).toFixed(d.step < 1 ? (d.step < 0.1 ? 2 : 1) : 0));
    input.addEventListener("input", () => {
      p[d.key] = d.type === "check" ? input.checked : d.type === "select" ? input.value : Number(input.value);
      show();
      save();
    });
    show();
    row.append(Object.assign(document.createElement("span"), { textContent: d.label }), input);
    if (d.type !== "select") row.append(out);
    box.append(row);
  }
}

/* ---------- 입력 고르기 ---------- */

const hand = new HandSense();
let board = null;     // ./start.sh 로 열었고 --serial off 가 아니면 생긴다
let sim = null;

function useSource(kind) {
  sim?.stop();
  sim = kind === "sim" ? new SimSense() : null;
  if (kind === "board" && !board) board = new BoardSense();
  $("source").value = kind;
}

// 지금 쓸 센서 값. 보드가 끊겨 있으면 단추로 넘어간다
function readRaw() {
  if (sim) return { raw: sim.read(), from: "sim" };
  if ($("source").value === "board" && board?.live) return { raw: board.read(), from: "board" };
  return { raw: hand.read(), from: "hand" };
}
// 손이나 가짜 관객일 때는 그 숫자에 맞춘 값을 쓴다. 보드일 때만 직접 잰 값을 쓴다
const calibFor = (from) => (from === "board" ? calib : FAKE);

$("source").addEventListener("change", (e) => useSource(e.target.value));

const toggleNear = () => { hand.here = !hand.here; };
const toggleLift = () => { hand.docked = !hand.docked; };
$("b-near").addEventListener("click", toggleNear);
$("b-lift").addEventListener("click", toggleLift);

/* ---------- 거치대 맞추기 ---------- */

let measuring = null;   // { which, until, load: [], ir: [] }
function measure(which) {
  measuring = { which, until: performance.now() / 1000 + CALIB_SEC, load: [], ir: [] };
}
function measureStep(raw, t) {
  if (!measuring || !raw) return;
  if (raw.load !== null) measuring.load.push(raw.load);
  if (raw.ir !== null) measuring.ir.push(raw.ir);
  if (t < measuring.until) return;
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const w = measuring.which;
  calib[`load${w}`] = avg(measuring.load);
  calib[`ir${w}`] = avg(measuring.ir);
  saveCalib();
  measuring = null;
}
$("c-empty").addEventListener("click", () => measure("Empty"));
$("c-full").addEventListener("click", () => measure("Full"));

function calibText(from) {
  if (from !== "board") return "지금은 흉내 낸 값이라 맞출 필요가 없습니다. 보드를 꽂으면 여기서 맞춥니다.";
  const f = (v) => (v === null ? "안 잼" : Math.round(v));
  if (measuring) return "재는 중. 거치대를 건드리지 마세요";
  return `무게: 비었을 때 ${f(calib.loadEmpty)} · 올렸을 때 ${f(calib.loadFull)}\n` +
         `적외선: 비었을 때 ${f(calib.irEmpty)} · 올렸을 때 ${f(calib.irFull)}\n` +
         "두 값의 가운데를 문턱으로 씁니다. 센서를 옮기면 다시 잽니다.";
}

/* ---------- 모터로 내보내기 ---------- */

let motorSentAt = 0;
let motorOff = false;     // 받는 서버가 없으면(설치 없이 보는 주소) 한 번 해 보고 그만둔다
async function sendMotor(level, t) {
  if (motorOff || t - motorSentAt < MOTOR_SEND_SEC) return;
  motorSentAt = t;
  try {
    const res = await fetch("motor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ power: Math.round(level * 255) }),
    });
    if (!res.ok) throw new Error(res.status);
  } catch {
    motorOff = true;
  }
}

/* ---------- 지나온 일 그래프 ---------- */

const TRACE_SEC = 20;
const trace = [];
function drawTrace(t) {
  const c = $("trace");
  const r = c.getBoundingClientRect();
  if (c.width !== Math.round(r.width * 2)) { c.width = Math.round(r.width * 2); c.height = 180; }
  const g = c.getContext("2d");
  const W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  const lanes = ["near", "reed", "load", "ir"];
  const lh = H / lanes.length;
  const L = 76;   // 왼쪽은 이름 자리
  const css = getComputedStyle(document.documentElement);
  g.fillStyle = css.getPropertyValue("--on");
  for (const s of trace) {
    const x = L + (W - L) * (1 - (t - s.t) / TRACE_SEC);
    lanes.forEach((k, i) => { if (s[k]) g.fillRect(x, i * lh + lh * 0.25, 3, lh * 0.5); });
  }
  g.fillStyle = css.getPropertyValue("--dim");
  g.font = "18px system-ui, sans-serif";
  ["사람", "리드", "무게", "적외선"].forEach((n, i) => g.fillText(n, 6, i * lh + lh * 0.65));
}

/* ---------- 한 프레임 ---------- */

const screen = new Screen($("out"));
const detect = new Detect();
const flow = new Flow();
const t0 = performance.now() / 1000;
let last = performance.now();
let fps = 60;

const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const show = (id, v) => ($(`r-${id}`).textContent = v === null || v === undefined ? "안 씀" : String(Math.round(v)));
const pill = (id, v, yes, no) => {
  const el = $(`d-${id}`);
  el.textContent = v === null ? "" : v ? yes : no;
  el.className = v ? "yes" : "";
};

function loop(nowMs) {
  const dt = Math.min(0.1, (nowMs - last) / 1000);
  last = nowMs;
  fps = fps * 0.9 + (1 / Math.max(0.001, dt)) * 0.1;
  const t = nowMs / 1000;

  const { raw, from } = readRaw();
  measureStep(raw, t);
  const s = detect.update(raw, t, p, calibFor(from));
  flow.ended = screen.ended;
  const out = flow.step(s, t, p);
  screen.draw(out, p, t, dt);
  sendMotor(out.motor, t);

  const v = detect.verdict;
  trace.push({ t, near: s.near, reed: v.reed, load: v.load, ir: v.ir });
  while (trace.length && t - trace[0].t > TRACE_SEC) trace.shift();

  if (!document.body.classList.contains("display")) {
    // 녹화에도 남도록 상태를 캔버스 위에 적는다
    const g = screen.g;
    const size = Math.max(12, Math.round(screen.canvas.width / 60));
    g.font = `600 ${size}px system-ui, sans-serif`;
    g.textAlign = "left";
    g.fillStyle = "rgba(0,0,0,0.5)";
    const tag = `${STATES[out.state]} · ${(t - flow.since).toFixed(1)}초 · 모터 ${Math.round(out.motor * 100)}%`;
    g.fillRect(size * 0.6, size * 0.6, g.measureText(tag).width + size, size * 1.7);
    g.fillStyle = "#fff";
    g.fillText(tag, size * 1.1, size * 1.85);

    if (raw) {
      show("pir", raw.pir); show("cm", raw.cm); show("reed", raw.reed); show("load", raw.load); show("ir", raw.ir);
    }
    pill("pir", raw?.pir === null ? null : raw?.pir === 1 && p.usePir, "사람", "없음");
    pill("cm", raw?.cm === null ? null : raw?.cm <= p.nearCm, "가까움", "멂");
    pill("reed", v.reed, "놓임", "빔");
    pill("load", v.load, "놓임", "빔");
    pill("ir", v.ir, "놓임", "빔");
    drawTrace(t);

    $("state").innerHTML = `${STATES[out.state]}<small>${(t - flow.since).toFixed(1)}초째 · 헤드셋 ${s.docked ? "거치대에" : "밖에"}</small>`;
    $("m-motor").style.width = `${out.motor * 100}%`;
    $("v-motor").textContent = `${Math.round(out.motor * 100)}%`;
    $("log").innerHTML = flow.log.slice(0, 12).map((e) => `<li>${mmss(e.t - t0)} ${e.text}</li>`).join("");
    $("wire").textContent = out.note || screen.note ||
      (motorOff ? "모터로 내보내기 꺼짐 (./start.sh 로 열면 아두이노로 나갑니다)" : "모터 세기는 0.25초마다 아두이노로 나갑니다");
    $("wire").className = out.note || screen.note ? "hint warn" : "hint";
    $("calib").innerText = calibText(from);

    const where = from === "board" ? `아두이노 ${board.lines}줄 받음` :
      from === "sim" ? "가짜 관객이 저절로 다가오고 헤드셋을 들었다 놓습니다" :
      $("source").value === "board" ? "보드를 기다리는 중. 그동안은 아래 단추로 흉내 냅니다" : "아래 단추나 N · 스페이스로 흉내 냅니다";
    $("status").textContent = where;
    $("b-near").classList.toggle("on", from === "sim" ? sim.here : hand.here);
    $("b-lift").classList.toggle("on", from === "sim" ? !sim.docked : !hand.docked);
    $("fps").textContent = `${Math.round(fps)} fps`;
  }
  requestAnimationFrame(loop);
}

/* ---------- 버튼과 키 ---------- */

$("only").addEventListener("click", () => document.body.classList.toggle("display"));
$("reset").addEventListener("click", () => {
  for (const d of PARAMS) p[d.key] = d.value;
  save();
  buildPanel();
});
addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  const k = e.key.toLowerCase();
  if (e.code === "Space") { e.preventDefault(); toggleLift(); }
  if (k === "n") toggleNear();
  if (k === "h") document.body.classList.toggle("display");
  if (k === "f") document.fullscreenElement ? document.exitFullscreen() : $("stage").requestFullscreen?.();
});

/* 전시 중에 화면이 저절로 꺼지면 안 된다. 되는 브라우저에서만 막는다. */
let wake = null;
async function keepAwake() {
  try {
    if (!wake && navigator.wakeLock) {
      wake = await navigator.wakeLock.request("screen");
      wake.addEventListener("release", () => (wake = null));
    }
  } catch {}
}
addEventListener("pointerdown", keepAwake);
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && keepAwake());

/* ---------- 시작 ---------- */

buildPanel();
if (display) document.body.classList.add("display");

(async () => {
  await screen.load();
  // ./start.sh 로 열었으면 보드를 쓰고, 설치 없이 보는 주소면 단추로 시작한다
  let served = false;
  try { served = !(await (await fetch("board.json", { cache: "no-store" })).json()).off; } catch {}
  useSource(url.has("sim") ? "sim" : served ? "board" : "hand");
  keepAwake();
  requestAnimationFrame(loop);
})();

/* ./start.sh --offline N. 장비 없이 N초를 녹화해 serve.py 에 보낸다. 검증용. */
const offline = Number(url.get("offline") || 0);
if (offline > 0) {
  setTimeout(() => {
    const type = ["video/mp4;codecs=avc1", "video/mp4", "video/webm"].find((t) => window.MediaRecorder?.isTypeSupported?.(t));
    if (!type) { $("status").textContent = "이 브라우저는 녹화를 지원하지 않습니다"; return; }
    const chunks = [];
    const rec = new MediaRecorder($("out").captureStream(30), { mimeType: type });
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      const ext = type.includes("mp4") ? "mp4" : "webm";
      await fetch(`save?ext=${ext}`, { method: "POST", body: new Blob(chunks, { type }) }).catch(() => {});
    };
    rec.start(1000);
    setTimeout(() => rec.stop(), offline * 1000);
  }, 500);
}

window.dockplay = { p, flow, detect, screen, hand, get calib() { return calib; } };

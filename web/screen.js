/*
 출력. 대기 영상과 본 영상을 한 캔버스에 그린다.

 영상은 web/media/ 아래 두 폴더에서 온다. 파일만 넣으면 start 가 목록(media.json)을 만든다.
   idle/   기다리는 동안 되풀이하는 영상. 여럿이면 이름 순서대로 돈다
   play/   헤드셋을 내려놓으면 처음부터 트는 영상. 여럿이면 이름 순서대로 이어 튼다
 영상이 없으면 자리표시 화면이 대신 돈다. 영상을 다 만들기 전에도 흐름을 볼 수 있게 하려는 것이다.

 캔버스에 그리는 까닭: 밝아지고 어두워지는 것을 한 자리에서 다루고, 녹화(--offline)도 이 캔버스를 찍는다.
*/

import { PLACEHOLDER_SEC } from "./settings.js";

function makeVideo() {
  const v = document.createElement("video");
  v.playsInline = true;
  v.preload = "auto";
  return v;
}

export class Screen {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext("2d");
    this.media = { idle: [], play: [] };
    this.idle = makeVideo();
    this.main = makeVideo();
    this.idleAt = 0;
    this.mainAt = 0;
    this.idleA = 0;            // 대기 화면의 밝기 0~1
    this.mainA = 0;            // 본 영상의 밝기 0~1
    this.playId = 0;
    this.playing = false;
    this.placeholderStart = null;
    this.ended = false;        // 본 영상이 끝까지 돌았다 (flow.js 가 읽는다)
    this.muted = false;        // 브라우저가 소리를 막았다
    this.note = "";

    this.idle.addEventListener("ended", () => this.nextIdle());
    this.main.addEventListener("ended", () => this.nextMain());
    this.main.addEventListener("error", () => this.nextMain());
    // 소리가 막혀 있으면 화면을 한 번 누르는 것으로 풀린다
    addEventListener("pointerdown", () => this.unmute());
  }

  async load() {
    try {
      const res = await fetch("media/media.json", { cache: "no-store" });
      if (res.ok) this.media = await res.json();
    } catch {}
    this.media.idle ||= [];
    this.media.play ||= [];
    if (this.media.idle.length) this.setIdle(0);
    return this.media;
  }

  setIdle(i) {
    this.idleAt = i % this.media.idle.length;
    this.idle.src = `media/idle/${encodeURIComponent(this.media.idle[this.idleAt])}`;
    this.idle.loop = this.media.idle.length === 1;
    this.start(this.idle);
  }
  nextIdle() { if (this.media.idle.length > 1) this.setIdle(this.idleAt + 1); }

  setMain(i) {
    this.mainAt = i;
    this.main.src = `media/play/${encodeURIComponent(this.media.play[i])}`;
    this.start(this.main);
  }
  nextMain() {
    if (!this.playing) return;
    if (this.mainAt + 1 < this.media.play.length) this.setMain(this.mainAt + 1);
    else this.ended = true;
  }

  // 소리와 함께 튼다. 브라우저가 막으면 소리 없이 틀고 알린다
  async start(v) {
    v.muted = this.muted;
    try {
      await v.play();
    } catch (e) {
      if (e.name !== "NotAllowedError") return;
      this.muted = true;
      v.muted = true;
      this.note = "브라우저가 소리를 막았습니다. 화면을 한 번 누르면 소리가 납니다";
      v.play().catch(() => {});
    }
  }
  unmute() {
    if (!this.muted) return;
    this.muted = false;
    this.idle.muted = false;
    this.main.muted = false;
    this.note = "";
  }

  // flow.js 의 결과를 받아 한 프레임을 그린다
  draw(out, p, t, dt) {
    // 새로 틀 차례면 처음부터
    if (out.play && out.playId !== this.playId) {
      this.playId = out.playId;
      this.playing = true;
      this.ended = false;
      if (this.media.play.length) this.setMain(0);
      else this.placeholderStart = t;
    }
    if (!out.play && this.playing) this.playing = false;

    // 자리표시 화면은 정해진 길이가 지나면 끝난다
    if (this.playing && !this.media.play.length && t - this.placeholderStart >= PLACEHOLDER_SEC) this.ended = true;

    // 밝아지고 어두워지기
    const k = p.fadeSec > 0 ? dt / p.fadeSec : 1;
    const toward = (a, b) => (a < b ? Math.min(b, a + k) : Math.max(b, a - k));
    this.mainA = toward(this.mainA, this.playing ? 1 : 0);
    this.idleA = toward(this.idleA, !this.playing && p.idleShow ? 1 : 0);

    // 다 어두워진 영상은 멈춰 둔다. 본 영상은 다음에 처음부터 튼다
    if (this.mainA === 0 && !this.main.paused) this.main.pause();
    if (this.media.idle.length) {
      if (this.idleA === 0 && !this.idle.paused) this.idle.pause();
      if (this.idleA > 0 && this.idle.paused) this.start(this.idle);
    }
    this.idle.volume = p.volume * this.idleA;
    this.main.volume = p.volume * this.mainA;

    this.fit();
    const { g, canvas } = this;
    g.globalAlpha = 1;
    g.fillStyle = "#000";
    g.fillRect(0, 0, canvas.width, canvas.height);
    if (this.idleA > 0) {
      g.globalAlpha = this.idleA;
      if (this.media.idle.length) this.video(this.idle);
      else this.waves(t);
    }
    if (this.mainA > 0) {
      g.globalAlpha = this.mainA;
      if (this.media.play.length) this.video(this.main);
      else this.placeholder(t);
    }
    g.globalAlpha = 1;
  }

  fit() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(2, Math.round(r.width * dpr));
    const h = Math.max(2, Math.round(r.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }

  // 화면 안에 잘리지 않게 넣는다
  video(v) {
    if (!v.videoWidth) return;
    const { g, canvas } = this;
    const s = Math.min(canvas.width / v.videoWidth, canvas.height / v.videoHeight);
    const w = v.videoWidth * s;
    const h = v.videoHeight * s;
    g.drawImage(v, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  }

  // 대기 영상 자리표시: 밀려왔다 빠지는 물결선
  waves(t) {
    const { g, canvas } = this;
    const W = canvas.width, H = canvas.height;
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#0b1a24");
    grad.addColorStop(1, "#14303c");
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    g.lineWidth = Math.max(1, W / 600);
    for (let i = 0; i < 14; i++) {
      const y0 = H * (0.42 + i * 0.04);
      const amp = H * 0.012 * (1 + i * 0.25);
      const swell = Math.sin(t * 0.35 + i * 0.45);
      g.strokeStyle = `rgba(200,225,230,${0.08 + i * 0.03})`;
      g.beginPath();
      for (let x = 0; x <= W; x += W / 120) {
        const y = y0 + swell * amp * 0.6 + Math.sin(x / W * 9 + t * 0.8 + i) * amp * 0.5;
        x ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    }
    this.label("대기 영상 자리 · web/media/idle/ 에 영상을 넣으면 여기서 되풀이됩니다");
  }

  // 본 영상 자리표시: 떠다니는 덩어리와 남은 시간
  placeholder(t) {
    const { g, canvas } = this;
    const W = canvas.width, H = canvas.height;
    const e = this.placeholderStart === null ? 0 : t - this.placeholderStart;
    g.fillStyle = "#06090d";
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 9; i++) {
      const x = W * (0.5 + 0.34 * Math.sin(e * 0.13 * (1 + i * 0.17) + i * 2.1));
      const y = H * (0.5 + 0.3 * Math.cos(e * 0.11 * (1 + i * 0.13) + i * 1.3));
      const r = Math.min(W, H) * (0.05 + 0.03 * Math.sin(e * 0.7 + i));
      const grd = g.createRadialGradient(x, y, 0, x, y, r * 2.2);
      grd.addColorStop(0, `hsla(${170 + i * 14},55%,62%,0.55)`);
      grd.addColorStop(1, "hsla(190,60%,40%,0)");
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, r * 2.2, 0, Math.PI * 2);
      g.fill();
    }
    const left = Math.max(0, PLACEHOLDER_SEC - e);
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.fillRect(W * 0.1, H * 0.9, W * 0.8, Math.max(2, H * 0.004));
    g.fillStyle = "rgba(255,255,255,0.7)";
    g.fillRect(W * 0.1, H * 0.9, W * 0.8 * Math.min(1, e / PLACEHOLDER_SEC), Math.max(2, H * 0.004));
    this.label(`본 영상 자리 · 남은 ${left.toFixed(0)}초 · web/media/play/ 에 영상을 넣으면 여기서 나옵니다`);
  }

  label(text) {
    const { g, canvas } = this;
    const size = Math.max(11, Math.round(canvas.width / 70));
    g.font = `${size}px system-ui, -apple-system, sans-serif`;
    g.fillStyle = "rgba(255,255,255,0.55)";
    g.textAlign = "center";
    g.fillText(text, canvas.width / 2, canvas.height * 0.86);
  }
}

#!/usr/bin/env python3
"""
시작하는 자리. web/ 폴더를 작은 웹 서버로 띄우고 브라우저를 연다.

아두이노는 센서 값을 한 줄씩 올려 보내고(arduino/dockplay), 여기서 그 줄을 브라우저로 넘긴다.
브라우저가 「사람이 왔는가」「헤드셋이 거치대에 있는가」를 판단하고 영상을 튼다.
모터 세기는 반대로 브라우저 → 여기 → 아두이노로 내려간다.

  python3 serve.py                 아두이노를 찾아 센서를 읽는다. 없으면 화면의 단추로 흉내 낸다
  python3 serve.py --sim           보드 없이 가짜 관객으로
  python3 serve.py --offline 40    40초 동안의 화면을 out.mp4(또는 out.webm)로 적고 끝낸다
  python3 serve.py --serial auto   아두이노를 찾아 연결한다 (기본). 끄려면 --serial off
  python3 serve.py --host 0.0.0.0  다른 컴퓨터에서 본다
  python3 serve.py --port 7001     포트를 바꾼다. 쓰이고 있으면 다음 빈 번호를 찾는다

보드가 없어도, pyserial 이 없어도 화면은 그대로 돈다. 선이 빠지면 몇 초마다 다시 찾는다.
"""

from __future__ import annotations

import argparse
import functools
import glob
import http.server
import json
import os
import platform
import re
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HERE = Path(__file__).parent
WEB = HERE / "web"


def find_board() -> str | None:
    """아두이노가 꽂힌 자리를 찾는다. 맥은 usbmodem, 리눅스는 ttyACM, 윈도우는 COM 이다."""
    try:
        from serial.tools import list_ports

        ports = list(list_ports.comports())
        for port in ports:
            name = f"{port.manufacturer or ''} {port.description or ''}".lower()
            if any(k in name for k in ("arduino", "wch", "ch340", "silicon labs", "ftdi", "usb serial", "esp32")):
                return port.device
        # USB 로 꽂힌 것만 본다. 맥의 블루투스 자리나 리눅스의 ttyS 는 보드가 아니다
        usb = [p for p in ports if p.vid is not None]
        if usb:
            return usb[0].device
        return None
    except ImportError:
        pass
    for pattern in ("/dev/tty.usbmodem*", "/dev/tty.usbserial*", "/dev/ttyACM*", "/dev/ttyUSB*"):
        hits = sorted(glob.glob(pattern))
        if hits:
            return hits[0]
    return None


class Board:
    """아두이노와 주고받는다. 센서 줄은 listeners 에게 넘기고, 모터 세기는 보드로 보낸다.

    보드가 없거나 선이 빠지면 몇 초마다 다시 찾는다. 전시 중에 선을 다시 꽂아도 이어진다.
    """

    RETRY = 3.0   # 보드를 다시 찾는 간격(초)

    def __init__(self, where: str, baud: int):
        self.want = where
        self.baud = baud
        self.port = None
        self.where = ""
        self.last_line = ""
        self.lines = 0
        self.lock = threading.Lock()
        self.listeners: list = []
        try:
            import serial  # noqa: F401
        except ImportError:
            print("pyserial 이 없어 보드와 주고받지 않습니다. 화면의 단추로는 그대로 돕니다.")
            return
        threading.Thread(target=self._run, daemon=True).start()

    def status(self) -> dict:
        where = self.where if self.port else ""
        return {"connected": bool(self.port), "where": where, "lines": self.lines, "last": self.last_line}

    def _open(self) -> bool:
        import serial

        where = self.want if self.want not in ("", "auto") else (find_board() or "")
        if not where:
            if self.where != "?":
                print("아두이노를 찾지 못했습니다. 꽂으면 저절로 이어집니다. 그동안은 화면의 단추로 봅니다.")
            self.where = "?"
            return False
        try:
            self.port = serial.Serial(where, self.baud, timeout=0.2, write_timeout=0)
            self.where = where
            print(f"아두이노에 연결했습니다: {where}")
            return True
        except Exception as exc:
            if self.where != f"!{where}":
                print(f"아두이노에 연결하지 못했습니다({exc}). {self.RETRY:g}초마다 다시 해 봅니다.")
            self.where = f"!{where}"
            return False

    def _run(self) -> None:
        pending = b""
        while True:
            if not self.port:
                if not self._open():
                    time.sleep(self.RETRY)
                    continue
            try:
                raw = self.port.readline()
            except Exception:
                print("아두이노 선이 빠졌습니다. 다시 꽂으면 이어집니다.")
                self.port = None
                self.where = "?"
                pending = b""
                continue
            # 기다리다 시간이 다 되면 줄의 앞부분만 올 수 있다. 줄바꿈이 올 때까지 모아 둔다
            pending += raw
            if not pending.endswith(b"\n"):
                continue
            line, pending = pending.decode("ascii", "ignore").strip(), b""
            if not line:
                continue
            self.last_line = line
            self.lines += 1
            for push in list(self.listeners):
                push(line)

    def send(self, text: str) -> None:
        if not self.port:
            return
        try:
            with self.lock:
                self.port.write((text + "\n").encode())
        except Exception:
            pass   # 읽는 쪽이 끊김을 알아채고 다시 찾는다


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/quicktime",
        ".m4v": "video/mp4",
    }
    on_saved = None   # --offline 일 때 파일을 받으면 부른다
    board: Board | None = None

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    # 영상을 되감거나 다시 틀려면 브라우저가 파일의 일부만 달라고 한다(Range).
    # 파이썬 기본 서버는 이것을 몰라 영상이 처음으로 돌아가지 못한다. 그래서 여기서 받아 준다.
    def send_head(self):
        rng = self.headers.get("Range")
        path = self.translate_path(self.path)
        if not rng or not os.path.isfile(path):
            return super().send_head()
        m = re.match(r"bytes=(\d*)-(\d*)", rng)
        size = os.path.getsize(path)
        if not m or (not m.group(1) and not m.group(2)):
            return super().send_head()
        if m.group(1):
            start, end = int(m.group(1)), int(m.group(2)) if m.group(2) else size - 1
        else:
            start, end = max(0, size - int(m.group(2))), size - 1
        end = min(end, size - 1)
        if start > end:
            self.send_error(416)
            return None
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        self._left = end - start + 1
        return f

    def copyfile(self, source, outputfile) -> None:
        # 브라우저는 영상을 받다가 자주 끊고 다른 구간을 다시 달라고 한다. 그때의 끊김은 오류가 아니다
        try:
            left = getattr(self, "_left", None)
            if left is None:
                return super().copyfile(source, outputfile)
            self._left = None
            while left > 0:
                chunk = source.read(min(65536, left))
                if not chunk:
                    break
                outputfile.write(chunk)
                left -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _json(self, data: dict) -> None:
        body = json.dumps(data).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = urlparse(self.path).path

        # 보드가 붙었는지
        if path == "/board.json":
            self._json(Handler.board.status() if Handler.board else {"connected": False, "off": True})
            return

        # 센서 줄을 그대로 흘려보낸다(server-sent events). 브라우저의 EventSource 가 받는다.
        if path == "/events":
            if not Handler.board:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            box: list[str] = []
            ready = threading.Event()

            def push(line: str) -> None:
                box.append(line)
                ready.set()

            Handler.board.listeners.append(push)
            try:
                while True:
                    ready.wait(2.0)
                    ready.clear()
                    out, box[:] = box[:], []
                    # 아무것도 없어도 2초마다 빈 줄을 보내 끊긴 연결을 알아챈다
                    data = "".join(f"data: {line}\n\n" for line in out) or ": \n\n"
                    self.wfile.write(data.encode())
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
            finally:
                Handler.board.listeners.remove(push)
            return

        super().do_GET()

    def do_POST(self) -> None:
        url = urlparse(self.path)
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))

        # 브라우저가 보내는 모터 세기 0~255
        if url.path == "/motor":
            try:
                power = max(0, min(255, int(json.loads(body).get("power", 0))))
            except (ValueError, AttributeError):
                self.send_error(400)
                return
            if Handler.board:
                Handler.board.send(f"M,{power}")
            self.send_response(204)
            self.end_headers()
            return

        # --offline 녹화만 받는다. 이 컴퓨터에서 온 것만.
        if url.path != "/save" or self.client_address[0] not in ("127.0.0.1", "::1"):
            self.send_error(404)
            return
        ext = parse_qs(url.query).get("ext", ["webm"])[0]
        ext = ext if ext in ("mp4", "webm") else "webm"
        out = HERE / f"out.{ext}"
        out.write_bytes(body)
        self.send_response(200)
        self.end_headers()
        print(f"{out.name} 에 적었습니다 ({len(body) / 1e6:.1f}MB).")
        if Handler.on_saved:
            Handler.on_saved()

    def log_message(self, *args) -> None:  # 요청마다 줄이 쌓이면 오류가 묻힌다
        pass


def open_browser(url: str) -> None:
    # 맥이면 크롬을 먼저 찾는다. 사파리도 되지만 크롬에서 가장 많이 시험했다.
    if platform.system() == "Darwin":
        if subprocess.run(["open", "-a", "Google Chrome", url], capture_output=True).returncode == 0:
            return
    webbrowser.open(url)


def bind(host: str, port: int) -> http.server.ThreadingHTTPServer:
    """포트가 쓰이고 있으면 다음 번호를 찾는다. 같은 것을 두 번 켜도 겹치지 않는다."""
    handler = functools.partial(Handler, directory=str(WEB))
    for p in range(port, port + 20):
        try:
            server = http.server.ThreadingHTTPServer((host, p), handler)
            server.daemon_threads = True   # 열린 센서 흐름이 끄는 것을 막지 않게
            return server
        except OSError:
            continue
    print(f"{port}~{port + 19} 번이 모두 쓰이고 있습니다. --port 로 다른 번호를 주세요.")
    raise SystemExit(1)


def main() -> None:
    sys.stdout.reconfigure(line_buffering=True)  # 자동 시작 로그 파일에도 바로 적히게
    ap = argparse.ArgumentParser(description="헤드셋을 내려놓으면 영상이 시작되는 흐름을 띄운다")
    ap.add_argument("--sim", action="store_true", help="보드 없이 가짜 관객으로")
    ap.add_argument("--display", action="store_true", help="조절판 없이 영상만")
    ap.add_argument("--offline", type=float, default=0, help="초 단위. 장비 없이 그만큼을 out.mp4 로 적는다")
    ap.add_argument("--host", default="127.0.0.1", help="다른 기기에서 보려면 0.0.0.0")
    ap.add_argument("--port", type=int, default=7000)
    ap.add_argument("--no-open", action="store_true", help="브라우저를 열지 않는다")
    ap.add_argument("--query", default="", help="주소 뒤에 그대로 붙일 것. 예: display")
    ap.add_argument("--serial", default="auto", help="아두이노가 꽂힌 자리. 끄려면 --serial off")
    ap.add_argument("--baud", type=int, default=115200, help="아두이노와 맞춰 둔 속도")
    args = ap.parse_args()

    q = []
    if args.offline:
        q += ["sim", f"offline={args.offline:g}"]
    elif args.sim:
        q.append("sim")
    if args.display:
        q.append("display")
    if args.query:
        q.append(args.query)

    if args.serial != "off" and not args.offline and not args.sim:
        Handler.board = Board(args.serial, args.baud)

    server = bind(args.host, args.port)
    port = server.server_address[1]
    url = f"http://127.0.0.1:{port}/" + ("?" + "&".join(q) if q else "")

    if args.offline:
        Handler.on_saved = lambda: threading.Thread(target=server.shutdown).start()
        print(f"{args.offline:g}초 동안의 화면을 녹화합니다. 브라우저가 열렸다가 끝나면 out 파일이 생깁니다.")
    else:
        print(f"열렸습니다: {url}")
        print("끝내려면 Ctrl+C (창을 닫아도 됩니다)")
    if not args.no_open:
        threading.Timer(0.8, open_browser, [url]).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n껐습니다.")


if __name__ == "__main__":
    main()

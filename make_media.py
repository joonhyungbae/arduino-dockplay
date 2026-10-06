#!/usr/bin/env python3
"""
작가의 영상 목록을 만든다. ./start.sh 가 켤 때마다 대신 돌려 준다.

  python3 make_media.py

web/media/idle/ 과 web/media/play/ 안의 영상(mp4·webm·mov·m4v)을 파일 이름 순서대로 모아
web/media/media.json 에 적는다. 브라우저는 폴더 안을 들여다볼 수 없어서 이 목록이 필요하다.

  idle/   기다리는 동안 되풀이하는 영상
  play/   헤드셋을 내려놓으면 처음부터 트는 영상. 여럿이면 이름 순서대로 이어 튼다
"""

from __future__ import annotations

import json
from pathlib import Path

MEDIA = Path(__file__).parent / "web" / "media"
VIDEOS = {".mp4", ".webm", ".mov", ".m4v"}


def videos(folder: Path) -> list[str]:
    folder.mkdir(parents=True, exist_ok=True)
    return sorted(f.name for f in folder.iterdir() if f.is_file() and f.suffix.lower() in VIDEOS)


def main() -> None:
    out = {"idle": videos(MEDIA / "idle"), "play": videos(MEDIA / "play")}
    (MEDIA / "media.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"대기 영상 {len(out['idle'])}개 · 본 영상 {len(out['play'])}개를 적었습니다.")
    if not out["play"]:
        print("web/media/play/ 에 영상을 넣으면 그 영상이 나옵니다. 없으면 자리표시 화면이 대신 돕니다.")


if __name__ == "__main__":
    main()

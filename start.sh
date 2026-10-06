#!/usr/bin/env bash
#
# 켜기 (맥 · 리눅스)
#
#   ./start.sh                 아두이노가 꽂혀 있으면 찾아서 센서를 읽는다. 없으면 단추로 흉내 낸다
#   ./start.sh --sim           보드 없이 가짜 관객이 저절로 다가오고 헤드셋을 들었다 놓는다
#   ./start.sh --display       조절판 없이 영상만 (전시용 화면)
#   ./start.sh --offline 40    장비 없이 40초를 out.mp4 로 적는다
#   ./start.sh --serial off    아두이노를 찾지 않는다
#   ./start.sh --host 0.0.0.0  다른 컴퓨터에서 본다
#   ./start.sh --port 7001     포트를 바꾼다
#
# conda 환경(dockplay)으로 켠다. conda 는 터미널 설정 없이도 찾는다(scripts/conda.sh).
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck source=scripts/conda.sh
source scripts/conda.sh

CONDA="$(find_conda)" || { echo "conda 가 없습니다. 먼저 설치해 주세요:  bash install.sh" >&2; exit 1; }
env_exists "$CONDA" || { echo "conda 환경($ENV_NAME)이 없습니다. 먼저 설치해 주세요:  bash install.sh" >&2; exit 1; }
py() { "$CONDA" run --no-capture-output -n "$ENV_NAME" python "$@"; }

# 작가가 web/media/ 에 넣어 둔 영상 목록을 다시 만든다. 파일만 넣으면 되게 한다.
py make_media.py

py serve.py "$@"

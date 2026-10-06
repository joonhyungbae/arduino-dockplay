# arduino-dockplay

**사람이 다가오면 모터가 돌기 시작합니다.** 거치대에 놓인 헤드셋을 들어 써 보고 다시 내려놓으면
화면의 영상이 처음부터 재생됩니다. 영상이 끝나면 잠시 쉬었다가 대기 화면으로 돌아갑니다.

노트북 한 대와 아두이노 하나로 돕니다. 아두이노는 센서 값을 읽어 올려 보내기만 하고, 사람이 왔는지와
헤드셋이 놓였는지는 노트북의 브라우저가 판단합니다. 그래서 문턱과 순서를 화면의 조절판에서 바로 바꿀 수 있습니다.
거치대 감지는 리드 스위치, 무게(로드셀), 반사 적외선 셋을 나란히 꽂아 견줄 수 있습니다.

설치 없이 보려면 <https://joonhyungbae.github.io/arduino-dockplay/> 를 크롬으로 엽니다.
「사람 다가옴」과 「헤드셋 듦」 단추로 흐름을 먼저 볼 수 있습니다.

《2026 오픈서킷 부산: 아트앤테크 프랙티스》 멘토링 과정에서 만든 예제입니다. 참여 작가와
작업을 구상하다 공통으로 쓸 만한 뼈대가 나와, 참여자 누구나 쓸 수 있도록 공개합니다.
바꿔 가며 자기 작품으로 만드는 출발점입니다.

## 1. 깔기

터미널을 엽니다. 윈도우는 시작 메뉴에서 `PowerShell`, 맥은 `터미널`입니다.

**맥 · 리눅스**

```bash
curl -fsSL https://raw.githubusercontent.com/joonhyungbae/arduino-dockplay/main/install.sh | bash
```

**윈도우 (PowerShell)**

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
irm https://raw.githubusercontent.com/joonhyungbae/arduino-dockplay/main/install.ps1 -OutFile "$env:TEMP\install.ps1"
& "$env:TEMP\install.ps1"
```

설치가 챙기는 것: conda 환경(`dockplay`)과, 아두이노와 주고받는 pyserial.
conda 가 없으면 [Miniforge](https://conda-forge.org/download/)를 사용자 폴더에 먼저 깝니다.
받아 올 모델이나 자료가 없어서 금방 끝납니다.

## 2. 켜기

```bash
./start.sh          # 맥 · 리눅스
.\start.ps1         # 윈도우
```

맥에서는 `start.command` 를 더블클릭해도 됩니다. 브라우저가 저절로 열립니다. 안 열리면 `127.0.0.1:7000` 을 칩니다.
끌 때는 <kbd>Ctrl</kbd>+<kbd>C</kbd>. 아두이노가 꽂혀 있으면 저절로 찾아 연결하고, 없으면 화면의 단추로 흉내 냅니다.
켜 둔 채로 보드를 꽂거나 선이 빠졌다 다시 꽂혀도 저절로 이어집니다.

| 명령 | 하는 일 |
|---|---|
| `./start.sh` | 보드가 있으면 센서로, 없으면 단추로 |
| `./start.sh --sim` | 보드 없이 가짜 관객이 저절로 다가오고 헤드셋을 들었다 놓는다 |
| `./start.sh --display` | 조절판 없이 영상만. 전시용 화면이다 |
| `./start.sh --offline 40` | 가짜 관객으로 40초를 녹화해 out 파일로 적고 끝낸다 |
| `./start.sh --serial /dev/tty.usbmodem1101` | 보드 자리를 직접 적는다. 끄려면 `--serial off` |
| `./start.sh --host 0.0.0.0` | 폰이나 다른 컴퓨터에서 조절판을 본다 |
| `./start.sh --port 7001` | 포트를 바꾼다 |

## 3. 화면에서 보는 것

- **왼쪽 큰 화면**: 관객이 보는 화면. 왼쪽 위에 지금 상태와 모터 세기가 적힙니다(영상만 보기에서는 사라집니다)
- **무엇으로 읽나**: 아두이노, 화면의 단추, 가짜 관객 가운데 하나
- **센서**: 다섯 센서의 숫자와 판단. 아래 그래프는 최근 20초 동안 사람·리드·무게·적외선이 「있음」으로 본 때입니다
- **거치대 맞추기**: 무게와 적외선은 빈 거치대와 헤드셋을 올린 거치대를 한 번씩 재야 판단합니다
- **흐름**: 지금 상태(빔 · 옴 · 씀 · 영상 · 쉼), 모터 세기, 지나온 일
- **조절**: 거치대 감지 방법부터 소리 크기까지. 바꾼 값은 이 브라우저에 남습니다

## 4. 바꾸는 자리

1. **`web/media/`**: 영상을 넣는 자리입니다. `idle/` 에는 기다리는 동안 되풀이할 영상, `play/` 에는
   헤드셋을 내려놓으면 틀 영상을 넣습니다. 파일만 넣고 다시 켜면 됩니다. 비어 있으면 자리표시 화면이 돕니다.
2. **`web/settings.js`**: 숫자가 전부 여기 있습니다. 조절판 항목도 이 파일에서 만듭니다.
3. **`web/flow.js`**: 일이 일어나는 순서입니다. 영상 중에 사람이 떠나면 멈출지, 두 사람이 연달아
   쓰면 처음부터 다시 틀지 같은 것을 여기서 정합니다.
4. **`web/detect.js`**: 센서 숫자를 「사람이 있다」「헤드셋이 놓였다」로 바꾸는 자리입니다.
5. **`arduino/dockplay/dockplay.ino`**: 어떤 센서를 쓰는지와 핀 번호입니다.

고치고 브라우저를 새로 고치면 바로 보입니다. 빌드가 없습니다.

## 5. 아두이노 연결

`arduino/dockplay/dockplay.ino` 를 아두이노 IDE 로 열어 보드에 한 번 올려 둡니다. 따로 깔 라이브러리는
없습니다. 파일 맨 위의 `USE_` 다섯 줄에서 꽂은 센서만 1 로 둡니다. 꽂지 않은 센서를 1 로 두면 엉뚱한 값이 올라옵니다.

| 센서 | 핀 | 비고 |
|---|---|---|
| 적외선 동작 센서 (HC-SR501 등) | D2 | 사람이 움직이면 1. 가만히 서 있으면 몇 초 뒤 0 이 된다 |
| 리드 스위치 + 자석 | D3 · GND | 거치대에 스위치, 헤드셋에 자석. 저항이 필요 없다 |
| 로드셀 + HX711 | DT D4 · SCK D5 | 거치대 아래에 둔다. 「거치대 맞추기」로 두 값을 잰다 |
| 초음파 거리 센서 (HC-SR04) | TRIG D6 · ECHO D7 | 사람까지의 거리. 조절판의 「다가옴 거리」와 견준다 |
| 반사 적외선 (TCRT5000 등 아날로그 출력) | A0 | 거치대 바닥에서 위를 본다. 「거치대 맞추기」로 두 값을 잰다 |
| 모터 | D9 (PWM) | 반드시 모터 드라이버(MOSFET 모듈, L298N, TB6612 등)를 거친다 |

보드는 초당 20번 이런 줄을 올려 보냅니다. 쓰지 않는 센서 자리는 `-` 입니다.

```text
S,1,83,1,-,-     동작,거리(cm),리드,무게,적외선
```

노트북은 0.25초마다 모터 세기(0~255)를 내려보냅니다. 보드는 받은 값으로 한 번에 가지 않고 조금씩
따라가고, 3초 동안 아무것도 오지 않으면 모터를 저절로 멈춥니다. 노트북이 꺼지거나 선이 빠져도
모터가 돈 채로 남지 않게 하려는 것입니다.

모터의 전원은 따로 둔 전원에서 받습니다. 보드의 5V 로 모터를 돌리면 보드가 꺼졌다 켜졌다
합니다. 모터 전원의 GND 와 보드의 GND 는 반드시 함께 묶습니다.

## 6. 안 될 때

| 이런 일이 생기면 | 이렇게 합니다 |
|---|---|
| 「보드를 기다리는 중」에서 안 바뀐다 | 아두이노 IDE 의 시리얼 모니터를 닫습니다. 열려 있으면 다른 프로그램이 보드를 못 엽니다 |
| 보드를 못 찾는다 | `./start.sh --serial /dev/tty.usbmodem1101` 처럼 자리를 직접 적습니다. 아두이노 IDE 의 포트 목록에 있는 이름입니다 |
| 헤드셋을 안 건드렸는데 「씀」이 된다 | 그래프에서 고른 센서의 줄이 끊기는지 봅니다. 리드 스위치면 자석을 가까이, 무게나 적외선이면 거치대를 다시 잽니다 |
| 들었다 놓았는데 영상이 안 나온다 | 조절판의 「써 봤다고 볼 시간」보다 짧게 든 것입니다. 지나온 일에 「몇 초만 들었다 놓았다」로 남습니다 |
| 사람이 서 있는데 모터가 멈춘다 | 동작 센서는 가만히 있으면 꺼집니다. 「떠났다고 볼 때까지」를 늘리거나 초음파를 함께 씁니다 |
| 영상에 소리가 안 난다 | 브라우저는 사람이 화면을 한 번 누르기 전에는 소리를 막습니다. 켠 뒤 화면을 한 번 누릅니다 |
| 고친 영상이 안 바뀐다 | 다시 켭니다. 켤 때 영상 목록을 새로 만듭니다 |
| 모터가 떨리거나 보드가 꺼진다 | 모터 전원을 보드와 떼어 따로 둔 전원에서 받습니다 |
| 포트가 쓰이고 있다 | `./start.sh --port 7001` 처럼 바꿉니다 |

## 7. 더 들어가기

```text
serve.py                web/ 를 띄우고, 보드의 줄을 브라우저로 넘기고, 모터 세기를 보드로 내린다
make_media.py           web/media/ 의 영상 목록을 만든다. start 가 켤 때마다 돌린다
arduino/dockplay/       보드에 올리는 스케치. 센서를 읽고 모터를 돌린다
web/
├── settings.js         만지는 숫자
├── sense.js            센서 값을 받는다 (아두이노 · 단추 · 가짜 관객)
├── detect.js           센서 값 → 사람이 있나, 헤드셋이 놓였나
├── flow.js             빔 → 옴 → 씀 → 영상 → 쉼
├── screen.js           대기 영상과 본 영상을 그린다
└── app.js              위의 것들을 한 프레임마다 잇고 조절판을 그린다
```

판단을 노트북에 둔 까닭, 거치대 센서 셋의 차이, 전시장에서 하루 종일 돌릴 때
챙길 것은 [docs/notes.md](docs/notes.md) 에 있습니다. AI 도구로 고칠 때의 규칙은 [AGENTS.md](AGENTS.md).

## 쓰는 것과 라이선스

브라우저에 들어 있는 것(Canvas, video, EventSource)만 씁니다. 받아 오는 라이브러리가 없어서 인터넷
없이 돕니다. 보드 쪽 스케치도 아두이노 기본 기능만 씁니다. 전체 목록은 [NOTICE.md](NOTICE.md).

코드는 [OpenCircuit License v1.0](LICENSE)을 따릅니다. 소스를 공개하되 쓰임을 제한하는 라이선스이고,
오픈소스 라이선스와는 다릅니다.

- **됩니다**: 받아서 쓰고 고치기. 이것으로 만든 **작품**은 전시하고 팔아도 허가가 필요 없습니다.
- **문의해 주세요**: 강좌나 워크숍의 교재로 쓰는 것, 코드 자체를 파는 것. <jh.bae@kaist.ac.kr>

---

<details>
<summary>English</summary>

A visitor approaches and a motor starts. They lift a headset from its stand, wear it, and put it
back; the video on the screen then plays from the start. When it ends, the screen rests and returns
to the idle loop.

```bash
curl -fsSL https://raw.githubusercontent.com/joonhyungbae/arduino-dockplay/main/install.sh | bash
cd arduino-dockplay && ./start.sh --sim
```

The Arduino only reports raw sensor values (`S,pir,cm,reed,load,ir`, 20 Hz) and receives a motor
level (`M,0-255`); all decisions happen in the browser so thresholds and the sequence can be tuned
live. Three dock sensors (reed switch, HX711 load cell, reflective IR) can be wired side by side and
compared. Drop videos into `web/media/idle/` and `web/media/play/`; placeholders run until then.
The sequence lives in `web/flow.js`.

Source-available, not open source: personal and artistic use is free and the works you make are
entirely yours; teaching with it or selling it needs permission ([LICENSE](LICENSE)).

</details>

<sub>《2026 오픈서킷 부산: 아트앤테크 프랙티스》에서 만든 작품 베이스라인입니다. 다른 도구는
[opencircuit](https://github.com/joonhyungbae/opencircuit)에 모여 있습니다.</sub>

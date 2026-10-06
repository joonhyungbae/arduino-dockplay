# 제3자 구성요소

이 저장소는 받아 오는 라이브러리가 없습니다. 브라우저와 아두이노에 들어 있는 기능만 씁니다.

| 쓰는 것 | 어디 것 | 라이선스 |
|---|---|---|
| Canvas 2D · video · EventSource | 브라우저 표준 | 브라우저에 포함 |
| Python 표준 라이브러리 (`http.server`) | Python | PSF |
| [pyserial](https://github.com/pyserial/pyserial) | pySerial | BSD-3-Clause |
| 아두이노 코어 (`analogWrite`, `pulseIn` 등) | Arduino | LGPL-2.1 |

HX711 은 라이브러리를 쓰지 않고 스케치 안에서 직접 읽습니다(데이터시트의 읽기 순서를 따랐습니다).

화면에 쓰는 글꼴은 쓰는 사람의 기계에 있는 것(system-ui)입니다. 내려받는 글꼴이 없습니다.
영상은 저장소에 들어 있지 않습니다. 작가가 `web/media/` 에 넣습니다.

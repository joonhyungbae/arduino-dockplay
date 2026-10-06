/*
 dockplay. 센서 값을 노트북으로 올려 보내고, 노트북이 정한 모터 세기를 받는다.

 판단(사람이 왔는가, 헤드셋이 놓였는가)은 노트북의 브라우저가 한다. 여기서는 읽기만 한다.
 그래야 문턱을 바꿀 때마다 보드에 다시 올리지 않고 화면의 조절판으로 맞출 수 있다.

 보내는 줄 (초당 20번)
   S,<적외선 동작>,<거리 cm>,<리드 스위치>,<무게>,<반사 적외선>
   S,1,83,1,-,-
   쓰지 않는 센서는 - 로 보낸다. 초음파는 메아리가 없으면 -1 이다.

 받는 줄
   M,<0~255>       모터 세기. 3초 동안 아무것도 안 오면 저절로 0 으로 내려간다

 쓰는 센서는 아래 USE_ 를 1 로 바꾼다. 꽂지 않은 센서를 1 로 두면 엉뚱한 값이 올라간다.
 HX711 은 라이브러리 없이 직접 읽는다. 아두이노 IDE 에서 따로 깔 것이 없다.
*/

// ─── 쓰는 센서 ───────────────────────────────────────────────────────────
#define USE_PIR    1   // 적외선 동작 센서(HC-SR501 등). 사람이 다가왔는지
#define USE_SONAR  1   // 초음파 거리 센서(HC-SR04). 사람이 얼마나 가까운지
#define USE_REED   1   // 리드 스위치 + 자석. 헤드셋이 거치대에 놓였는지
#define USE_LOAD   0   // 로드셀 + HX711. 거치대 위의 무게
#define USE_IR     0   // 반사형 적외선(TCRT5000 아날로그 출력 등). 거치대 위에 무엇이 있는지

// ─── 핀 ─────────────────────────────────────────────────────────────────
const int PIN_PIR = 2;
const int PIN_REED = 3;       // 한쪽 다리는 GND. 내부 풀업을 쓰므로 저항이 필요 없다
const int PIN_LOAD_DT = 4;
const int PIN_LOAD_SCK = 5;
const int PIN_SONAR_TRIG = 6;
const int PIN_SONAR_ECHO = 7;
const int PIN_MOTOR = 9;      // PWM. 모터는 반드시 드라이버(MOSFET 모듈, L298N, TB6612 등)를 거친다
const int PIN_IR = A0;

// ─── 숫자 ───────────────────────────────────────────────────────────────
const unsigned long SEND_EVERY_MS = 50;     // 줄을 보내는 간격
const unsigned long MOTOR_TIMEOUT_MS = 3000; // 노트북이 조용하면 모터를 내린다
const int MOTOR_STEP = 4;                   // 한 번(10ms)에 바뀌는 세기. 작을수록 부드럽게 오르내린다
const unsigned long SONAR_TIMEOUT_US = 25000; // 이보다 늦은 메아리는 버린다(약 4m)

int motorNow = 0;
int motorWant = 0;
unsigned long lastCommand = 0;
unsigned long lastSend = 0;
unsigned long lastStep = 0;
char buf[24];
int bufLen = 0;

void setup() {
  Serial.begin(115200);
  pinMode(PIN_PIR, INPUT);
  pinMode(PIN_REED, INPUT_PULLUP);
  pinMode(PIN_SONAR_TRIG, OUTPUT);
  pinMode(PIN_SONAR_ECHO, INPUT);
  pinMode(PIN_LOAD_DT, INPUT);
  pinMode(PIN_LOAD_SCK, OUTPUT);
  digitalWrite(PIN_LOAD_SCK, LOW);
  pinMode(PIN_MOTOR, OUTPUT);
  analogWrite(PIN_MOTOR, 0);
  Serial.println("# dockplay");
}

// 초음파: 거리(cm). 메아리가 없으면 -1
long readSonar() {
  digitalWrite(PIN_SONAR_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_SONAR_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_SONAR_TRIG, LOW);
  unsigned long us = pulseIn(PIN_SONAR_ECHO, HIGH, SONAR_TIMEOUT_US);
  if (us == 0) return -1;
  return us / 58;
}

// HX711: 24비트 값. 준비가 안 됐으면 지난 값을 그대로 둔다
long loadLast = 0;
long readLoad() {
  if (digitalRead(PIN_LOAD_DT) == HIGH) return loadLast;   // 아직 새 값이 없다
  long v = 0;
  noInterrupts();
  for (int i = 0; i < 24; i++) {
    digitalWrite(PIN_LOAD_SCK, HIGH);
    delayMicroseconds(1);
    v = (v << 1) | digitalRead(PIN_LOAD_DT);
    digitalWrite(PIN_LOAD_SCK, LOW);
    delayMicroseconds(1);
  }
  digitalWrite(PIN_LOAD_SCK, HIGH);   // 25번째 펄스: 다음에도 A 채널, 128배
  delayMicroseconds(1);
  digitalWrite(PIN_LOAD_SCK, LOW);
  interrupts();
  if (v & 0x800000) v |= 0xFF000000;  // 음수 부호를 넓힌다
  loadLast = v;
  return v;
}

void readCommand() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      buf[bufLen] = 0;
      if (bufLen > 2 && buf[0] == 'M' && buf[1] == ',') {
        motorWant = constrain(atoi(buf + 2), 0, 255);
        lastCommand = millis();
      }
      bufLen = 0;
    } else if (bufLen < (int)sizeof(buf) - 1) {
      buf[bufLen++] = c;
    }
  }
}

void loop() {
  readCommand();
  unsigned long now = millis();

  // 노트북이 꺼지거나 선이 빠지면 모터가 돈 채로 남지 않게 한다
  if (now - lastCommand > MOTOR_TIMEOUT_MS) motorWant = 0;

  // 모터는 한 번에 바뀌지 않고 조금씩 따라간다. 갑자기 돌면 장치가 튀고 전원이 흔들린다
  if (now - lastStep >= 10) {
    lastStep = now;
    if (motorNow < motorWant) motorNow = min(motorNow + MOTOR_STEP, motorWant);
    if (motorNow > motorWant) motorNow = max(motorNow - MOTOR_STEP, motorWant);
    analogWrite(PIN_MOTOR, motorNow);
  }

  if (now - lastSend < SEND_EVERY_MS) return;
  lastSend = now;

  Serial.print("S,");
  if (USE_PIR) Serial.print(digitalRead(PIN_PIR)); else Serial.print('-');
  Serial.print(',');
  if (USE_SONAR) Serial.print(readSonar()); else Serial.print('-');
  Serial.print(',');
  if (USE_REED) Serial.print(digitalRead(PIN_REED) == LOW ? 1 : 0); else Serial.print('-');   // 자석이 붙으면 1
  Serial.print(',');
  if (USE_LOAD) Serial.print(readLoad()); else Serial.print('-');
  Serial.print(',');
  if (USE_IR) Serial.print(analogRead(PIN_IR)); else Serial.print('-');
  Serial.println();
}

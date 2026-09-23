# 모바일 확장 — 왜 지금은 웹이고, Flutter는 어떻게 붙이는가

## 결론부터

이번 구현은 **웹(PWA)** 으로 했다. 그리고 **Flutter로 옮길 때 다시 짤 것이 없도록**
학습 로직 전체를 플랫폼 독립 계층에 몰아 두었다.

## 왜 웹을 먼저 골랐나

요청하신 조건이 "PC에서 돌아갈 것, HTML 같은 웹 기술 기반, 모바일 확장성 고려"였다.
이 셋을 놓고 보면 지금 단계에서 Flutter를 1순위로 두는 건 손해다.

**PC가 1순위인데 Flutter Web은 PC에서 약하다.**
Flutter Web은 캔버스에 직접 그리기 때문에 텍스트 선택·접근성·폰트 렌더링이
브라우저 네이티브보다 떨어진다. 이 게임은 화면 절반이 **한글과 영단어**다.
글자가 또렷하지 않으면 게임이 성립하지 않는다. 초기 번들도 수 MB로 시작한다.

**설치 마찰이 학습 습관을 결정한다.**
간격 반복은 매일 해야 의미가 있다. 링크 하나로 바로 시작되는 것과
스토어에서 받아야 하는 것의 차이는 생각보다 크다.
PWA는 데스크톱·안드로이드에서 "홈 화면에 추가"로 앱처럼 설치되고,
서비스 워커 덕에 오프라인에서도 완전히 돌아간다.

**지금 Flutter로 짜면 검증이 안 된다.**
이 저장소는 단위 테스트 86개와 실제 브라우저 E2E로 확인하며 만들었다.
빌드·실행·검증이 안 되는 코드를 "모바일 대응"이라며 얹는 건
확장성이 아니라 부채다.

**그리고 모바일은 이미 된다.**
터치 입력, 반응형 레이아웃, 모바일 HUD 축약이 들어가 있다.
E2E가 390×844 화면에서도 전투가 정상 진행되고 가로 스크롤이 없음을 확인한다.

## 그래서 Flutter는 언제 필요한가

다음 중 하나가 필요해지면 그때가 네이티브를 쓸 시점이다.

- 푸시 알림으로 "오늘 복습 42개" 를 띄우고 싶을 때 (iOS 웹 푸시는 여전히 제약이 많다)
- 앱스토어 배포가 필요할 때
- 위젯, 오프라인 TTS 음성 패키지, 백그라운드 동기화

## 이식 경로

계층을 이렇게 나눠 둔 게 전부 이걸 위해서다.

| 현재 (JS) | Flutter (Dart) | 작업량 |
|---|---|---|
| `src/core/fsrs.js` | `lib/core/fsrs.dart` | **거의 그대로 번역.** 순수 수학이다. |
| `src/core/srs.js` | `lib/core/srs.dart` | 그대로 |
| `src/core/scheduler.js` | `lib/core/scheduler.dart` | 그대로 |
| `src/core/run.js` | `lib/core/run.dart` | 그대로 |
| `src/core/optimizer.js` | `lib/core/optimizer.dart` | 그대로. 순수 수치 계산이다. |
| `src/core/upgrades.js`, `balance.js`, `rng.js`, `korean.js` | 동일 | 그대로 |
| `src/data/decks.js` | `assets/decks/*.txt` + 파서 | 그대로 |
| `src/platform/webStorage.js` | `shared_preferences` 또는 `sqflite` | **여기만 새로 씀** (~60줄) |
| `src/game/engine.js` | `lib/game/engine.dart` | 그대로 — 캔버스를 직접 안 쓴다 |
| `src/game/renderer.js` | `CustomPainter` 또는 Flame | **다시 씀.** 그리기는 플랫폼의 몫 |
| `src/game/input.js` | `GestureDetector` + `TextField` | 다시 씀 (~130줄, 철자 입력 포함) |
| `src/game/audio.js` | `just_audio` / `flutter_tts` | 다시 씀 (~120줄) |
| `src/ui/*` | Flutter 위젯 | 다시 씀 |

**`core/` 1,700여 줄이 그대로 넘어간다.** 알고리즘·밸런스·출제 로직을 다시
설계하거나 다시 검증할 일이 없다는 뜻이고, 이 프로젝트에서 가장 값이 나가는 부분이 그쪽이다.

`engine.js`까지 넘어가는 이유는 캔버스 의존을 주입으로 끊어 놨기 때문이다.

```js
// 엔진은 텍스트 폭을 "재는 방법"만 받는다. 캔버스를 모른다.
new Engine({ run, measureText: (text, size) => ... })
```

Dart에서는 `TextPainter`로 잰 값을 같은 자리에 넣으면 된다.

이 경계는 말로만 있는 게 아니라 `npm run check`가 매번 검사한다.
`core/` 안에서 브라우저 전역을 하나라도 만지면 실패한다.

```
계층 경계 (core는 브라우저를 몰라야 한다)
  ✓ 9개 코어 모듈 모두 플랫폼 독립적
```

## 이식할 때 주의할 점

1. **부동소수점.** Dart의 `double`은 JS `number`와 같은 IEEE 754 배정밀도라
   FSRS 수식 결과가 일치한다. `tests/fsrs.test.mjs`의 기대값을 Dart 테스트로
   그대로 옮겨 검증하면 된다.
2. **정수 나눗셈.** Dart의 `~/`와 `%`는 JS와 다르게 동작하는 경우가 있다.
   `rng.js`의 `Math.imul` 부분은 Dart에서 `int` 오버플로 처리를 명시해야 한다.
3. **시간.** 모든 시각을 epoch 밀리초 정수로 다룬다. `DateTime.now().millisecondsSinceEpoch`로 대체.
4. **저장 형식.** JSON 구조를 그대로 쓰면 웹에서 내보낸 백업을 모바일에서 가져올 수 있다.
   `Profile.importJSON`의 병합 규칙(더 많이 복습한 카드가 이긴다)을 그대로 옮길 것.
   개인 최적화 파라미터(`fsrsParams`)도 함께 넘어간다.
5. **철자 입력이 모바일에서 더 중요해진다.** 데스크톱에서는 마우스 조준이 주 입력이지만,
   휴대폰에서는 작은 화면에 떨어지는 칩을 탭하는 것보다 키보드로 쓰는 편이 정확하다.
   `answerMode`의 기본값을 플랫폼별로 다르게 잡는 것을 고려할 만하다.

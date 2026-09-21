# 구조

## 계층

```
src/
  core/        순수 로직 — 브라우저 API를 하나도 쓰지 않는다
    fsrs.js        FSRS-5 스케줄러 (DSR 모델, 망각곡선, 간격 계산)
    srs.js         카드 저장소 + 학습 단계 + 게임 이벤트 → 평가 변환
    scheduler.js   출제 선택 (무엇을 언제) + 오답 구성 (무엇과 함께)
    run.js         로그라이크 한 판의 상태 기계
    upgrades.js    유물 / 스킬 / 저주 정의와 수정치 조립
    balance.js     난이도 곡선, 점수 공식
    storage.js     프로필 · 통계 · 백업 (저장 매체는 주입받는다)
    rng.js         시드 고정 난수
    korean.js      조사 처리

  platform/    플랫폼에 묶인 얇은 어댑터
    webStorage.js  localStorage 구현

  game/        캔버스 · 입력 · 소리
    engine.js      미사일 커맨드 시뮬레이션 (볼리, 물리, 충돌, 판정)
    renderer.js    Canvas 2D 렌더링
    input.js       마우스 · 터치 · 키보드
    audio.js       WebAudio 합성 효과음 + 브라우저 TTS

  ui/          DOM 화면
    screens.js     시작 / 보상 / 결과 / 일시정지 / 설정 / 덱 / 도움말
    hud.js         인게임 오버레이
    stats.js       학습 통계 대시보드 (인라인 SVG)
    dom.js         DOM 헬퍼

  data/decks.js    내장 단어 덱
  main.js          위 셋을 모두 아는 유일한 파일
```

의존 방향은 한쪽으로만 흐른다.

```
main.js ──▶ ui ──▶ core
   │         │
   └──▶ game ┘
        │
        └──▶ platform
```

`core/`는 아래를 향하지 않는다. `window`, `document`, `localStorage`,
`canvas` 중 어느 것도 참조하지 않으며, 이건 `npm run check`가 매번 검사한다.
한 줄만 새도 실패한다.

이 경계를 지키는 이유는 두 가지다.

1. **테스트가 쉽다.** 게임 한 판 전체를 브라우저 없이 돌려 볼 수 있다.
   `tests/run.test.mjs`는 실제로 봇에게 여러 웨이브를 플레이시키고
   불변식이 깨지지 않는지 확인한다.
2. **이식이 가능하다.** 학습 알고리즘 전체가 플랫폼 독립적이므로
   Flutter/Dart로 옮길 때 다시 설계할 것이 없다. → [`MOBILE.md`](MOBILE.md)

## 한 문제(볼리)가 처리되는 흐름

```
run.nextQuestion()
   └ scheduler.pickTarget()      우선순위: 재출제 예약 → 밀린 복습 → 신규 → 추가 연습
   └ scheduler.pickDecoys()      혼동 가능성 가중 샘플링
        ↓
engine.spawnVolley()             정답 1 + 오답 n 을 같은 색으로 낙하시킴
        ↓
engine.fireAt(x, y)              가장 가까운 포탑 → 예측 조준 → 요격탄
        ↓
engine.updateExplosions()        폭발 반경 안의 미사일 파괴 (정답을 먼저 판정)
        ↓
engine.resolveVolley()
        ↓
run.resolveVolley()              점수 · 콤보 · 체력
   └ gradeFromEvent()            반응 시간 → 다시/어려움/보통/쉬움
   └ store.review()
        └ fsrs.computeDSR()      S, D 갱신
        └ 학습 단계 또는 장기 일정 확정
   └ scheduler.schedule()        이번 판 안에서 다시 물을 볼리 번호
```

## 게임 규칙의 근거

- **오답이 착탄해도 피해가 없다.** 피해는 정답을 놓쳤을 때만. 화면에 떨어지는 것들 중
  "무시해도 되는 것"이 분명해야 인지 부하가 단어 변별에 집중된다.
- **폭발이 정답과 오답을 함께 덮으면 정답으로 친다.** 플레이어는 단어를 맞게 골랐고
  조준이 조금 넓었을 뿐이다. 배열 순서 때문에 오답 처리되면 어휘력이 아니라 운을 벌하게 된다.
- **낙하 속도에 하한(3.1초)이 있다.** 웨이브가 올라가도 이 아래로는 안 내려간다.
  대신 동시 볼리 수와 오답 개수를 더 공격적으로 올린다.
  손이 아니라 기억이 먼저 한계에 닿아야 단어 게임이다.
- **예측 조준.** 위 README 참고. 빗나가는 이유는 단어 선택 실패뿐이어야 한다.

## 테스트

```bash
npm test                          # 단위·통합 86개
npm run check                     # 계층 경계 · SW 캐시 목록 · 자산 참조
node tools/serve.mjs &            # E2E는 서버가 필요하다
node tests/e2e/playthrough.mjs    # 실제 브라우저에서 한 웨이브 플레이
```

| 파일 | 무엇을 지키는가 |
|---|---|
| `fsrs.test.mjs` | 망각곡선·간격·안정성 수식이 FSRS-5와 일치하는가 |
| `srs.test.mjs` | 학습 단계 전이, 평가 변환, 재인 과제 보정 |
| `scheduler.test.mjs` | 출제 우선순위, 오답 품질, 시드 재현성 |
| `run.test.mjs` | 로그라이크 불변식, 봇 플레이 통합 |
| `engine.test.mjs` | 물리·충돌·판정 (DOM 없이) |
| `storage.test.mjs` | 저장·병합·마이그레이션 |
| `e2e/playthrough.mjs` | 실제 브라우저에서 진짜로 돌아가는가 |

`engine.test.mjs`가 DOM 없이 돌아가는 건 엔진이 텍스트 폭 측정을 **주입받기** 때문이다
(`measureText`). 캔버스를 직접 잡았다면 불가능했을 것이다.

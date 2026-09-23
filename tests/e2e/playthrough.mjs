/**
 * 브라우저 실제 구동 검증 (E2E).
 *
 * 단위 테스트는 로직이 맞는지를, 이건 "사람이 열었을 때 실제로 돌아가는지"를 본다.
 * 마우스로 정답을 요격해 한 웨이브를 끝내고, 보상 화면과 통계 화면까지 확인한다.
 *
 *   node tools/serve.mjs &            # 먼저 서버를 띄우고
 *   node tests/e2e/playthrough.mjs    # 이걸 돌린다
 *
 * PLAYWRIGHT 경로는 환경변수 PW로 덮어쓸 수 있다.
 */
// playwright는 전역 설치본을 쓴다 (컨테이너에 이미 있음). PW로 경로를 덮어쓸 수 있다.
const { chromium } = await import(process.env.PW || '/opt/node22/lib/node_modules/playwright/index.mjs');

const URL = process.env.URL || 'http://localhost:5173/index.html';
const SHOTS = process.env.SHOTS || null;
const problems = [];
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => { console.log(`  \x1b[31m✗\x1b[0m ${m}`); problems.push(m); };
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 850 } });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`${e.message}`));

console.log('\n시작 화면');
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await shot(page, '01-title');
(await page.title()).includes('어휘') ? ok('제목 로드') : bad('제목이 이상하다');
(await page.getByRole('button', { name: '출격' }).isVisible()) ? ok('출격 버튼') : bad('출격 버튼 없음');
await page.evaluate(() => window.__mwm) ? ok('앱 인스턴스 생성') : bad('앱이 초기화되지 않았다');

console.log('\n전투');
await page.getByRole('button', { name: '출격' }).click();
await page.waitForTimeout(900);
await shot(page, '02-play');

// 마우스로 정답만 계속 요격해 웨이브를 클리어한다
let clicks = 0;
const deadline = Date.now() + 75000;
while (Date.now() < deadline) {
  const st = await page.evaluate(() => {
    const app = window.__mwm;
    if (!app.run) return { over: true };
    if (app.screens.isOpen) return { screen: app.screens.current };
    const v = app.engine.activeVolleys()[0];
    if (!v) return { idle: true };
    const m = app.engine.missiles.find((x) => x.volleyId === v.id && x.correct && x.alive && !x.inert);
    if (!m || m.y < 40) return { idle: true };
    // 탄약은 조준 정확도를 보려는 테스트이므로 넉넉히 채운다
    for (const t of app.engine.turrets) if (t.ammo < 3) t.ammo = 12;
    const r = app.canvas.getBoundingClientRect();
    return { x: r.left + m.x * (r.width / app.renderer.W), y: r.top + m.y * (r.height / app.renderer.H) };
  });
  if (st.over || st.screen) break;
  if (st.idle) { await page.waitForTimeout(90); continue; }
  await page.mouse.click(st.x, st.y);
  clicks++;
  await page.waitForTimeout(140);
}

const mid = await page.evaluate(() => {
  const app = window.__mwm;
  return {
    screen: app.screens.current,
    score: app.run?.score ?? 0,
    correct: app.run?.stats.correct ?? 0,
    wrong: app.run?.stats.wrong ?? 0,
    landed: app.run?.stats.landed ?? 0,
    cities: app.run?.cities,
    maxCombo: app.run?.maxCombo,
  };
});
console.log(`  클릭 ${clicks}회 → ${JSON.stringify(mid)}`);
mid.correct > 4 ? ok(`정답 요격 ${mid.correct}회`) : bad(`요격이 거의 안 됐다 (${mid.correct}회)`);
mid.score > 0 ? ok(`점수 ${mid.score}`) : bad('점수가 안 올랐다');
mid.maxCombo >= 3 ? ok(`최고 연속 ${mid.maxCombo}`) : bad(`콤보가 안 쌓였다 (${mid.maxCombo})`);
// 정답만 겨냥했으므로 오폭이 거의 없어야 한다 — 예측 조준이 제 몫을 하는지 보는 지표
mid.correct >= mid.wrong * 4
  ? ok(`조준 정확도 정상 (정답 ${mid.correct} / 오폭 ${mid.wrong})`)
  : bad(`정답을 겨눴는데 오답 처리가 많다 (정답 ${mid.correct} / 오폭 ${mid.wrong})`);

console.log('\n웨이브 보상');
if (mid.screen === 'offer') {
  await shot(page, '03-offer');
  const offers = await page.locator('.offer').count();
  offers > 0 ? ok(`보상 ${offers}개 제시`) : bad('보상이 안 나왔다');
  const first = await page.locator('.offer-name').first().textContent();
  await page.locator('.offer').first().click();
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => ({
    wave: window.__mwm.run.wave,
    relics: window.__mwm.run.relics.length,
    skills: window.__mwm.run.skills.length,
    open: window.__mwm.screens.isOpen,
  }));
  after.wave === 2 ? ok(`"${first}" 선택 → 웨이브 2 시작`) : bad(`웨이브가 안 넘어갔다: ${after.wave}`);
  !after.open ? ok('보상 화면이 닫혔다') : bad('보상 화면이 안 닫힌다');
  (after.relics + after.skills) > 1 ? ok('보상이 실제로 적용됐다') : bad('보상이 적용되지 않았다');
  await shot(page, '04-wave2');
} else {
  bad(`보상 화면에 도달하지 못했다 (현재: ${mid.screen || '전투 중'})`);
}

console.log('\n일시정지 · 통계');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
(await page.evaluate(() => window.__mwm.screens.current)) === 'pause' ? ok('ESC 일시정지') : bad('일시정지 실패');
await page.getByRole('button', { name: '조작법' }).click();
await page.waitForTimeout(300);
await shot(page, '05-help');
await page.getByRole('button', { name: '닫기' }).click();
await page.waitForTimeout(300);

await page.evaluate(() => window.__mwm.screens.stats());
await page.waitForTimeout(700);
await shot(page, '06-stats');
const viz = await page.evaluate(() => ({
  cards: document.querySelectorAll('.viz-card').length,
  bars: document.querySelectorAll('.viz-bar').length,
  cells: document.querySelectorAll('.viz-cell').length,
  tiles: document.querySelectorAll('.tile').length,
  legend: document.querySelectorAll('.viz-legend .lg').length,
}));
console.log(`  대시보드: ${JSON.stringify(viz)}`);
viz.cards >= 4 ? ok(`차트 카드 ${viz.cards}개`) : bad('대시보드가 덜 그려졌다');
viz.bars > 0 ? ok(`복습 예정 막대 ${viz.bars}개`) : bad('예정량 차트가 비었다 — 복습 일정이 안 잡혔다는 뜻');
viz.cells > 50 ? ok(`히트맵 ${viz.cells}칸`) : bad('히트맵이 안 그려졌다');
viz.tiles >= 6 ? ok(`지표 타일 ${viz.tiles}개`) : bad('타일이 부족하다');

console.log('\n저장');
const saved = await page.evaluate(() => {
  window.__mwm.profile.flush();
  const raw = localStorage.getItem('mwm:profile:v1');
  if (!raw) return null;
  const d = JSON.parse(raw);
  const cards = Object.values(d.cards);
  return {
    cards: cards.length,
    log: d.log.length,
    repeated: cards.filter((c) => c.reps >= 2).length,
    badState: cards.filter((c) => !['new', 'learning', 'review', 'relearning'].includes(c.state)).length,
    scheduled: cards.filter((c) => c.state === 'review').length,
  };
});
saved && saved.cards > 0 ? ok(`카드 ${saved.cards}개 · 복습 로그 ${saved.log}건 저장됨`) : bad('저장이 안 됐다');
// 신규 단어는 Anki처럼 3회 성공 노출로 졸업한다. 한 웨이브(7볼리)에서는 아직 학습 단계에 있는 게 정상이고,
// 여기서 확인할 것은 "같은 판 안에서 다시 나왔는가"다.
saved && saved.repeated > 0
  ? ok(`같은 판에서 재출제된 단어 ${saved.repeated}개 (학습 단계 동작)`)
  : bad('틀리거나 새로 본 단어가 다시 나오지 않았다');
saved && saved.badState === 0 ? ok('모든 카드 상태가 유효하다') : bad(`상태가 깨진 카드 ${saved?.badState}개`);
console.log(`  (졸업해 장기 일정을 받은 단어: ${saved?.scheduled}개 — 웨이브를 더 진행하면 늘어난다)`);

console.log('\n숨김 요소');
// hidden 속성이 걸린 요소가 정말로 화면에서 사라지는지 본다.
// 속성만 확인하면 CSS 명시도 때문에 보이는 채로 남는 경우를 놓친다.
const ghosts = await page.evaluate(() => {
  const out = [];
  for (const node of document.querySelectorAll('[hidden]')) {
    const cs = getComputedStyle(node);
    if (cs.display !== 'none' && cs.visibility !== 'hidden') {
      out.push(node.className || node.tagName);
    }
  }
  return out;
});
ghosts.length === 0 ? ok('hidden 요소가 모두 실제로 숨겨져 있다') : bad(`hidden인데 보이는 요소: ${ghosts.join(', ')}`);

console.log('\n모바일 레이아웃');
const m = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await m.goto(URL, { waitUntil: 'networkidle' });
await m.waitForTimeout(500);
await (SHOTS ? m.screenshot({ path: `${SHOTS}/07-mobile.png` }) : Promise.resolve());
const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
!overflow ? ok('가로 스크롤 없음') : bad('모바일에서 가로로 넘친다');
await m.getByRole('button', { name: '출격' }).click();
await m.waitForTimeout(1800);
await (SHOTS ? m.screenshot({ path: `${SHOTS}/08-mobile-play.png` }) : Promise.resolve());
const mob = await m.evaluate(() => ({ missiles: window.__mwm.engine.missiles.length, w: window.__mwm.renderer.W }));
mob.missiles > 0 ? ok(`모바일에서도 전투 진행 (미사일 ${mob.missiles}개, 폭 ${mob.w}px)`) : bad('모바일에서 미사일이 안 뜬다');

console.log('\n콘솔');
consoleErrors.length === 0 ? ok('오류 없음') : bad(`콘솔 오류 ${consoleErrors.length}건: ${consoleErrors.slice(0, 3).join(' | ')}`);

await browser.close();
console.log(problems.length ? `\n\x1b[31m${problems.length}개 문제\x1b[0m\n` : '\n\x1b[32mE2E 전부 통과\x1b[0m\n');
process.exit(problems.length ? 1 : 0);

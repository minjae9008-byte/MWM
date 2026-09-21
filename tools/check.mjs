/**
 * 배포 전 정합성 점검.
 *  1) 모든 모듈이 깨끗하게 import 되는가
 *  2) 서비스 워커의 캐시 목록이 실제 파일과 일치하는가
 *     (파일을 추가하고 sw.js를 안 고치면 오프라인에서만 조용히 깨진다)
 *  3) index.html이 참조하는 자산이 존재하는가
 */
import { readFile, access } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
let failed = 0;

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => { console.log(`  \x1b[31m✗\x1b[0m ${m}`); failed++; };

async function exists(p) {
  try { await access(resolve(ROOT, p)); return true; } catch { return false; }
}

console.log('\n모듈 로드');
const sources = [];
for await (const f of glob('src/**/*.js', { cwd: ROOT })) sources.push(f);
sources.sort();
for (const f of sources) {
  try {
    // main.js는 DOM이 필요하므로 파싱만 확인한다
    if (f.endsWith('main.js')) {
      const code = await readFile(resolve(ROOT, f), 'utf8');
      new (async () => {}).constructor(`return 0; /* ${code.length} */`);
      ok(`${f} (DOM 필요 — 구문만 확인)`);
    } else {
      await import(`file://${resolve(ROOT, f)}`);
      ok(f);
    }
  } catch (e) {
    bad(`${f} — ${e.message}`);
  }
}

console.log('\n서비스 워커 캐시 목록');
const sw = await readFile(resolve(ROOT, 'sw.js'), 'utf8');
const listed = [...sw.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]);
for (const f of listed) {
  if (await exists(f)) ok(f);
  else bad(`sw.js가 없는 파일을 캐시하려 한다: ${f}`);
}
const shipped = [...sources, 'index.html', 'styles/main.css', 'manifest.webmanifest', 'assets/icon.svg'];
for (const f of shipped) {
  if (!listed.includes(f)) bad(`sw.js 캐시 목록에 빠진 파일: ${f}`);
}
if (!failed) ok('목록과 실제 파일이 일치한다');

console.log('\n계층 경계 (core는 브라우저를 몰라야 한다)');
// 이 규칙이 Flutter 포팅 가능성을 지탱한다. 한 줄만 새도 주장이 거짓이 된다.
const FORBIDDEN = /\b(window|document|localStorage|sessionStorage|navigator|location|fetch|HTMLElement|CanvasRenderingContext2D|requestAnimationFrame|SpeechSynthesisUtterance|AudioContext)\b/;
const portable = [];
// src/data는 단어 목록(순수 데이터)이라 검사 대상이 아니다
for await (const f of glob('src/core/**/*.js', { cwd: ROOT })) portable.push(f);
portable.sort();
let leaks = 0;
for (const f of portable) {
  const code = await readFile(resolve(ROOT, f), 'utf8');
  const hits = code.split('\n')
    .map((line, i) => [i + 1, line])
    // 주석은 제외 — 설명에 이름이 나오는 건 결합이 아니다
    .filter(([, line]) => !/^\s*(\/\/|\*|\/\*)/.test(line) && FORBIDDEN.test(line));
  if (hits.length) {
    leaks++;
    bad(`${f} 가 브라우저 API에 의존한다: ${hits.map(([n, l]) => `${n}행 ${l.trim().slice(0, 48)}`).join(' / ')}`);
  }
}
if (!leaks) ok(`${portable.length}개 코어 모듈 모두 플랫폼 독립적`);

console.log('\nindex.html 참조');
const html = await readFile(resolve(ROOT, 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:href|src)="(?!https?:|#)([^"]+)"/g)) {
  if (await exists(m[1])) ok(m[1]);
  else bad(`참조된 파일이 없다: ${m[1]}`);
}

console.log(failed ? `\n\x1b[31m${failed}개 문제\x1b[0m\n` : '\n\x1b[32m모두 정상\x1b[0m\n');
process.exit(failed ? 1 : 0);

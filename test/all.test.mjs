import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanText, parsePubDate, normalizeItem, pressName, NaverAuthError } from '../lib/naver.mjs'
import { merge, run, intervalNow } from '../lib/crawl.mjs'
import { loadSettings } from '../lib/config.mjs'

const item = (o = {}) => ({ title: '<b>삼성</b> &quot;HBM&quot; 공급', description: '설명 &amp; <b>강조</b>', originallink: 'https://www.yna.co.kr/view/AKR1', link: 'https://n.news.naver.com/x', pubDate: 'Sun, 26 Apr 2026 00:42:00 +0900', ...o })
const mem = (init) => { let st = init ?? { articles: [], meta: {} }; return { load: async () => structuredClone(st), save: async s => { st = structuredClone(s) }, get: () => st } }
const KW = [{ keyword: 'HBM', category: 'AI·반도체' }, { keyword: '트럼프', category: '인물' }]
const ST = { display: 5, concurrency: 2, retain_days: 3650, max_articles: 100, schedule: loadSettings().schedule }

test('cleanText: 태그 제거 + 엔티티 디코드, 스크립트는 평문 유지', () => {
  assert.equal(cleanText('<b>삼성</b> &quot;HBM&quot; &amp; 엔비디아'), '삼성 "HBM" & 엔비디아')
  assert.equal(cleanText('&lt;script&gt;x'), '<script>x')
})
test('pubDate: +0900 / +0000 모두 KST ISO', () => {
  assert.equal(parsePubDate('Sun, 26 Apr 2026 00:42:00 +0900').iso, '2026-04-26T00:42:00+09:00')
  assert.equal(parsePubDate('Sat, 25 Apr 2026 15:42:00 +0000').iso, '2026-04-26T00:42:00+09:00')
  assert.deepEqual(parsePubDate('garbage'), { iso: null, ts: 0 })
})
test('normalize: originallink 우선, 위험한 스킴 거부', () => {
  const a = normalizeItem(item(), 'HBM', 'c')
  assert.ok(a.link.startsWith('https://www.yna.co.kr') && a.press === '연합뉴스' && !a.title.includes('<'))
  assert.equal(normalizeItem(item({ originallink: 'javascript:alert(1)', link: 'javascript:alert(1)' }), 'k', 'c'), null)
})
test('merge: 검색어끼리 겹친 기사 중복 제거, 오래된·삭제된 검색어 정리', () => {
  const a1 = normalizeItem(item(), 'HBM', 'c'), a2 = normalizeItem(item(), '엔비디아', 'c')
  const old = normalizeItem(item({ originallink: 'https://x.com/old', pubDate: 'Mon, 01 Jan 2024 00:00:00 +0900' }), 'HBM', 'c')
  const gone = normalizeItem(item({ originallink: 'https://x.com/gone' }), '삭제', 'c')
  const out = merge([old, gone], [a1, a2], new Set(['HBM', '엔비디아']), a1.ts + 3600, 3, 800)
  assert.equal(out.length, 1); assert.deepEqual(out[0].keywords.sort(), ['HBM', '엔비디아'])
})
test('run: 성공 저장 → 인증 실패해도 이전 결과 보존 + 사유 기록', async () => {
  const store = mem()
  const ok = async (k, c) => [normalizeItem(item({ originallink: `https://a.com/${k}` }), k, c)]
  const m1 = await run({ store, keywords: KW, settings: ST, fetcher: ok, imageFetcher: async () => null })
  assert.ok(m1.last_success_at && !m1.last_error)
  const before = store.get().articles; assert.equal(before.length, 2)
  const bad = async () => { throw new NaverAuthError('네이버 API 인증 실패 (HTTP 401)') }
  await run({ store, keywords: KW, settings: ST, fetcher: bad })
  assert.deepEqual(store.get().articles, before)
  assert.ok(store.get().meta.last_error); assert.equal(store.get().meta.last_success_at, m1.last_success_at)
})
test('run: 일부 검색어 실패는 성공으로 처리', async () => {
  const f = async (k, c) => { if (k === 'HBM') throw new Error('HTTP 500'); return [normalizeItem(item(), k, c)] }
  const m = await run({ store: mem(), keywords: KW, settings: ST, fetcher: f, imageFetcher: async () => null })
  assert.equal(m.last_error, null); assert.equal(m.failed_keywords, 1)
})
test('intervalNow: 장중 10분 / 평일 밤·주말 60분 (UTC→KST 변환)', () => {
  const s = loadSettings()
  assert.equal(intervalNow(s, new Date('2026-11-05T01:00:00Z')), 600)   // 목 10:00 KST
  assert.equal(intervalNow(s, new Date('2026-11-05T12:00:00Z')), 3600)  // 목 21:00 KST
  assert.equal(intervalNow(s, new Date('2026-11-07T01:00:00Z')), 3600)  // 토 10:00 KST
})
test('pressName: 매핑 없는 co.kr 도메인도 이름이 나온다', () => {
  assert.equal(pressName('https://www.thebell.co.kr/a'), 'thebell.co.kr')
  assert.equal(pressName('https://news.nongaek.com/a'), 'nongaek.com')
  assert.equal(pressName('https://biz.chosun.com/a'), '조선비즈')
})
test('fetchKeyword: 429는 백오프 후 재시도해 성공한다', async () => {
  const { fetchKeyword } = await import('../lib/naver.mjs')
  let n = 0
  const f = async () => (++n < 3 ? { status: 429 } : { status: 200, json: async () => ({ items: [item()] }) })
  const r = await fetchKeyword('HBM', 'c', { env: { NAVER_CLIENT_ID: 'a', NAVER_CLIENT_SECRET: 'b' }, fetchImpl: f, backoffMs: 1 })
  assert.equal(r.length, 1); assert.equal(n, 3)
})

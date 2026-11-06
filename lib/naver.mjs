// 네이버 뉴스 검색 API 호출과 응답 정제. 키는 환경변수에서만 읽는다.
import he from 'he'

const API_URL = 'https://openapi.naver.com/v1/search/news.json'
export class NaverAuthError extends Error {}

const PRESS = {
  'yna.co.kr': '연합뉴스', 'yonhapnews.co.kr': '연합뉴스', 'news1.kr': '뉴스1', 'newsis.com': '뉴시스',
  'hankyung.com': '한국경제', 'mk.co.kr': '매일경제', 'sedaily.com': '서울경제', 'edaily.co.kr': '이데일리',
  'mt.co.kr': '머니투데이', 'fnnews.com': '파이낸셜뉴스', 'asiae.co.kr': '아시아경제', 'chosun.com': '조선일보',
  'joongang.co.kr': '중앙일보', 'donga.com': '동아일보', 'hani.co.kr': '한겨레', 'khan.co.kr': '경향신문',
  'kmib.co.kr': '국민일보', 'heraldcorp.com': '헤럴드경제', 'biz.chosun.com': '조선비즈', 'etnews.com': '전자신문',
  'zdnet.co.kr': 'ZDNet Korea', 'ytn.co.kr': 'YTN', 'sbs.co.kr': 'SBS', 'kbs.co.kr': 'KBS', 'imbc.com': 'MBC',
  'jtbc.co.kr': 'JTBC', 'mbn.co.kr': 'MBN', 'newspim.com': '뉴스핌', 'inews24.com': '아이뉴스24',
  'dt.co.kr': '디지털타임스', 'ajunews.com': '아주경제', 'segye.com': '세계일보', 'munhwa.com': '문화일보',
  'bizwatch.co.kr': '비즈워치',
}

/** 태그 제거 → 엔티티 디코드 → 공백 정리. 결과는 항상 평문이며 화면은 textContent로만 쓴다. */
export function cleanText(s) {
  return he.decode(String(s ?? '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
}

/** RFC 822('... +0900') → { iso: KST ISO, ts: epoch초 }. 실패하면 { iso:null, ts:0 } */
export function parsePubDate(s) {
  const d = new Date(s)
  if (!s || Number.isNaN(d.getTime())) return { iso: null, ts: 0 }
  const k = new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 19)
  return { iso: `${k}+09:00`, ts: Math.floor(d.getTime() / 1000) }
}

export function safeHttpUrl(u) {
  try {
    const p = new URL(String(u ?? '').trim())
    return p.protocol === 'http:' || p.protocol === 'https:' ? p.href : null
  } catch { return null }
}

export function pressName(url) {
  const parts = new URL(url).hostname.toLowerCase().split('.')
  for (const n of [3, 2]) { const k = parts.slice(-n).join('.'); if (PRESS[k]) return PRESS[k] }
  // co.kr · or.kr 같은 2단계 도메인은 한 칸 더 쓴다 (예: thebell.co.kr)
  const sld = new Set(['co', 'or', 'go', 'ne', 're', 'ac', 'pe'])
  return parts.slice(sld.has(parts.at(-2)) && parts.at(-1).length === 2 ? -3 : -2).join('.')
}

export function articleKey(url) {
  const p = new URL(url)
  return `${p.hostname.toLowerCase()}${p.pathname.replace(/\/$/, '')}${p.search}`
}

export function normalizeItem(item, keyword, category) {
  // 기사 열기: originallink(언론사 원문) 우선, 없으면 네이버 link
  const link = safeHttpUrl(item.originallink) || safeHttpUrl(item.link)
  if (!link) return null
  const { iso, ts } = parsePubDate(item.pubDate)
  return {
    key: articleKey(link), title: cleanText(item.title), description: cleanText(item.description),
    link, press: pressName(link), published_at: iso, ts, image: null, keywords: [keyword], category,
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

export async function fetchKeyword(keyword, category, { display = 5, env = process.env, fetchImpl = fetch, retries = 4, backoffMs = 1000 } = {}) {
  const id = env.NAVER_CLIENT_ID, secret = env.NAVER_CLIENT_SECRET
  if (!id || !secret) throw new NaverAuthError('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 이 설정되지 않았습니다')
  const url = `${API_URL}?${new URLSearchParams({ query: keyword, display, start: 1, sort: 'date' })}`
  let last = 'unknown'
  for (let i = 0; i < retries; i++) {
    let r
    try {
      r = await fetchImpl(url, { headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret }, signal: AbortSignal.timeout(8000) })
    } catch (e) { last = e.name; await sleep(backoffMs * 2 ** i); continue }
    if (r.status === 200) return ((await r.json()).items ?? []).map(it => normalizeItem(it, keyword, category)).filter(Boolean)
    if (r.status === 401 || r.status === 403) throw new NaverAuthError(`네이버 API 인증 실패 (HTTP ${r.status})`)
    if (r.status === 429) { last = 'HTTP 429'; await sleep(backoffMs * 2 ** i); continue }
    throw new Error(`HTTP ${r.status}`)
  }
  throw new Error(`재시도 초과 (${last})`)
}

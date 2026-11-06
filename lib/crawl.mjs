// 스케줄 작업: 네이버 호출 → 정제 → 병합 → 저장. 실패해도 이전 결과는 지우지 않는다.
import { NaverAuthError, fetchKeyword, safeHttpUrl } from './naver.mjs'

export const KST_OFFSET = 9 * 3600

export function kstNow(now = new Date()) { return new Date(now.getTime() + KST_OFFSET * 1000) }
export const isoKst = (now = new Date()) => kstNow(now).toISOString().slice(0, 19) + '+09:00'

/** 지금 시각 기준 갱신 주기(초). 장중(평일 09:00~15:59 KST) 10분, 그 외 60분 */
export function intervalNow(settings, now = new Date()) {
  const k = kstNow(now), s = settings.schedule
  const [lo, hi] = s.market_hours.hours
  const market = k.getUTCDay() >= 1 && k.getUTCDay() <= 5 && k.getUTCHours() >= lo && k.getUTCHours() <= hi
  return (market ? s.market_hours.every_minutes : s.off_hours.every_minutes) * 60
}

export function merge(prev, fresh, keep, nowTs, retainDays, maxArticles) {
  const byKey = new Map()
  for (const a of [...prev, ...fresh]) {
    const cur = byKey.get(a.key)
    if (!cur) { byKey.set(a.key, { ...a, keywords: [...a.keywords] }); continue }
    for (const k of a.keywords) if (!cur.keywords.includes(k)) cur.keywords.push(k)
    cur.image ||= a.image; cur.description ||= a.description; cur.published_at ||= a.published_at; cur.ts ||= a.ts
  }
  const cutoff = nowTs - retainDays * 86400
  return [...byKey.values()]
    .map(a => ({ ...a, keywords: a.keywords.filter(k => keep.has(k)) }))
    .filter(a => a.keywords.length && (a.ts === 0 || a.ts >= cutoff))
    .sort((x, y) => y.ts - x.ts)
    .slice(0, maxArticles)
}

export async function fetchOgImage(url, fetchImpl = fetch) {
  try {
    const r = await fetchImpl(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MarketNewsBot/1.0)' }, signal: AbortSignal.timeout(3000), redirect: 'follow' })
    const head = (await r.text()).slice(0, 200_000)
    const m = head.match(/<meta[^>]+(?:property=["']og:image["']|name=["']twitter:image["'])[^>]*>/i)
    const c = m && m[0].match(/content=["']([^"']+)["']/i)
    if (!c) return null
    const u = safeHttpUrl(c[1].startsWith('//') ? 'https:' + c[1] : c[1])
    return u && u.startsWith('https://') ? u : null // http 이미지는 혼합 콘텐츠라 제외
  } catch { return null }
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const j = i++; out[j] = await fn(items[j], j) }
  }))
  return out
}

/** 한 번 실행하고 meta 를 돌려준다. deps 로 저장소·fetch 를 주입(테스트·로컬용). */
export async function run({ store, keywords, settings, env = process.env, fetcher = fetchKeyword, imageFetcher = fetchOgImage, now = new Date(), deadlineMs = 22000 }) {
  const t0 = Date.now()
  const state = await store.load()
  const meta = { ...(state.meta || {}), last_attempt_at: isoKst(now), catalog: keywords.map(({ keyword, category }) => ({ keyword, category })) }
  const prev = state.articles || []
  const fresh = [], failed = []
  let authError = null, ok = 0

  // 네이버는 초당 호출 수를 제한한다(초과 시 429). 요청 '시작' 간격을 일정하게 벌려 버스트를 막는다.
  const gap = settings.request_gap_ms ?? 150
  let nextSlot = Date.now()
  const gate = async () => { const at = Math.max(nextSlot, Date.now()); nextSlot = at + gap; await new Promise(r => setTimeout(r, at - Date.now())) }
  await pool(keywords, settings.concurrency ?? 4, async k => {
    if (authError) return
    await gate()
    try { fresh.push(...await fetcher(k.keyword, k.category, { display: settings.display, env })); ok++ }
    catch (e) { if (e instanceof NaverAuthError) authError = e.message; else failed.push(k.keyword) }
  })

  if (authError || ok === 0) {
    meta.last_error = authError || '모든 검색어 호출 실패'
    meta.failed_keywords = failed.length
    await store.save({ articles: prev, meta })
    return meta
  }

  const known = new Map(prev.map(a => [a.key, a]))
  for (const a of fresh) if (known.get(a.key)?.image != null) a.image = known.get(a.key).image
  const need = [...new Map(fresh.filter(a => !known.has(a.key) && a.image == null).map(a => [a.key, a])).values()]
    .slice(0, settings.max_images_per_run ?? 40)
  await pool(need, 12, async a => { if (Date.now() - t0 < deadlineMs) a.image = await imageFetcher(a.link) })

  const keep = new Set(keywords.map(k => k.keyword))
  const articles = merge(prev, fresh, keep, Math.floor(now.getTime() / 1000), settings.retain_days, settings.max_articles)
  Object.assign(meta, { last_success_at: isoKst(now), last_error: null, failed_keywords: failed.length, fresh_articles: new Set(fresh.map(a => a.key)).size })
  await store.save({ articles, meta })
  return meta
}

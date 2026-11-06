// 캐시 버전은 서버가 정적 파일 해시로 채운다 → 배포하면 자동으로 새 캐시.
const VERSION = '__VERSION__'
const CACHE = 'mn-' + VERSION
const SHELL = ['/', '/manifest.webmanifest', '/app.css?v=' + VERSION, '/app.js?v=' + VERSION, '/icons/icon-192.png']

self.addEventListener('install', e => {
  // 셸 사전 캐시는 '정상 200, 리디렉션 아님'인 것만
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u =>
    fetch(u, { credentials: 'same-origin', redirect: 'manual' }).then(r => { if (r.ok && !r.redirected) return c.put(u, r) }).catch(() => {})
  ))).then(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})

const cacheable = res => res && res.ok && res.status === 200 && !res.redirected && res.type === 'basic'

self.addEventListener('fetch', e => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin) return
  if (url.pathname === '/sw.js') return
  // 네트워크 우선 → 실패(오프라인)일 때만 캐시. 401/리디렉션/로그인 화면은 캐시에 넣지 않고 그대로 전달.
  e.respondWith((async () => {
    try {
      const res = await fetch(req)
      if (cacheable(res)) {
        const key = url.pathname === '/' ? '/' : ((url.pathname === '/app.css' || url.pathname === '/app.js') ? url.pathname + url.search : url.pathname)
        const c = await caches.open(CACHE)
        c.put(key, res.clone())
      }
      return res
    } catch (_) {
      const key = url.pathname === '/' || req.mode === 'navigate' ? '/' : ((url.pathname === '/app.css' || url.pathname === '/app.js') ? url.pathname + url.search : url.pathname)
      const hit = await caches.match(key)
      if (hit) {
        if (url.pathname === '/api/news') {
          const h = new Headers(hit.headers); h.set('X-From-Cache', '1')
          return new Response(await hit.blob(), { status: 200, headers: h })
        }
        return hit
      }
      return new Response('offline', { status: 503 })
    }
  })())
})

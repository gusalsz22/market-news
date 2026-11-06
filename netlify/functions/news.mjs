// 화면용 읽기 전용 API. 저장된 결과만 돌려주며 네이버를 호출하지 않는다. 비밀 값은 응답에 포함되지 않는다.
import { blobStore } from '../../lib/store.mjs'
import { loadSettings } from '../../lib/config.mjs'
import { intervalNow } from '../../lib/crawl.mjs'

export default async () => {
  const { articles = [], meta = {} } = await blobStore().load()
  const { catalog = [], ...pub } = meta
  const cats = new Map()
  for (const c of catalog) cats.set(c.category, [...(cats.get(c.category) ?? []), c.keyword])
  const body = {
    articles: articles.map(({ key, ...a }) => a),
    categories: [...cats].map(([name, keywords]) => ({ name, keywords })),
    meta: { ...pub, stale_after_sec: intervalNow(loadSettings()) * 2, server_time: Math.floor(Date.now() / 1000) },
  }
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=30', 'x-content-type-options': 'nosniff' } })
}

export const config = { path: '/api/news' }

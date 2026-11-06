// 예약 실행(UTC 크론). 10분마다 깨어나, 장 시간이 아니면 마지막 시도 후 60분이 안 지났을 때 건너뛴다.
import { run, intervalNow } from '../../lib/crawl.mjs'
import { blobStore } from '../../lib/store.mjs'
import { loadKeywords, loadSettings } from '../../lib/config.mjs'

export default async () => {
  const store = blobStore(), settings = loadSettings()
  const last = (await store.load()).meta?.last_attempt_at
  const wait = intervalNow(settings) - 90 // 크론 지터 여유
  if (last && (Date.now() - new Date(last).getTime()) / 1000 < wait) { console.log('crawl skipped: not due'); return }
  const m = await run({ store, keywords: loadKeywords(), settings })
  console.log(`crawl done success=${m.last_success_at} error=${m.last_error} fresh=${m.fresh_articles} failed=${m.failed_keywords}`)
}

export const config = { schedule: '*/10 * * * *' }

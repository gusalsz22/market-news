// 로컬 수동 실행: node --env-file=.env scripts/crawl-local.mjs  (data/store.json 에 저장)
import { run } from '../lib/crawl.mjs'
import { fileStore } from '../lib/store.mjs'
import { loadKeywords, loadSettings } from '../lib/config.mjs'
const m = await run({ store: fileStore(), keywords: loadKeywords(), settings: loadSettings() })
console.log({ last_attempt_at: m.last_attempt_at, last_success_at: m.last_success_at, last_error: m.last_error, fresh: m.fresh_articles, failed: m.failed_keywords })
process.exit(m.last_error ? 1 : 0)

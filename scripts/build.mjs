// public/ → dist/ . 파일 내용 해시를 __VERSION__ 에 채워 서비스 워커 캐시를 배포마다 자동 갱신한다.
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const SRC = 'public', OUT = 'dist'
const walk = d => readdirSync(d).flatMap(f => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p] })
const h = createHash('sha256')
for (const f of walk(SRC).sort()) h.update(f).update(readFileSync(f))
const v = h.digest('hex').slice(0, 10)
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT)
cpSync(SRC, OUT, { recursive: true })
for (const f of ['index.html', 'sw.js']) {
  const p = path.join(OUT, f); writeFileSync(p, readFileSync(p, 'utf8').replaceAll('__VERSION__', v))
}
console.log('built dist/, version', v)

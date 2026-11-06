// 마지막 결과 저장소. Netlify 안에서는 Blobs, 로컬 스크립트에서는 파일.
import { getStore } from '@netlify/blobs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

const EMPTY = () => ({ articles: [], meta: {} })

export function blobStore() {
  const s = getStore({ name: 'market-news', consistency: 'strong' })
  return { load: async () => (await s.get('state', { type: 'json' })) ?? EMPTY(), save: st => s.setJSON('state', st) }
}

export function fileStore(dir = process.env.DATA_DIR || path.resolve('data')) {
  const file = path.join(dir, 'store.json')
  return {
    async load() { try { return JSON.parse(await readFile(file, 'utf8')) } catch { return EMPTY() } },
    async save(st) { await mkdir(dir, { recursive: true }); await writeFile(file + '.tmp', JSON.stringify(st)); await rename(file + '.tmp', file) },
  }
}

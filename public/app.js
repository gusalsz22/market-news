// 화면은 서버가 저장해 둔 결과(/api/news)를 읽기만 한다. 네이버를 직접 부르지 않고, 타이머로 갱신을 맡지도 않는다.
'use strict'
const $ = id => document.getElementById(id)
const KEY = 'mn-view'
let state = { articles: [], categories: [], meta: {} }
let view = { cat: '전체', kw: '', q: '' }
let mode = 'loading' // loading | ok | offline
try { Object.assign(view, JSON.parse(sessionStorage.getItem(KEY) || '{}').view || {}) } catch (_) {}

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v)
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)))
  return el
}

const KST = { timeZone: 'Asia/Seoul', hour12: false }
function absKst(iso) {
  const d = new Date(iso)
  const p = Object.fromEntries(new Intl.DateTimeFormat('ko-KR', { ...KST, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d).map(x => [x.type, x.value]))
  return `${p.month}.${p.day} ${p.hour}:${p.minute}`
}
function rel(iso, now = Date.now()) {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000)
  if (s < 60) return '방금'
  if (s < 3600) return `${Math.floor(s / 60)}분 전`
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`
  return `${Math.floor(s / 86400)}일 전`
}
const hm = iso => new Intl.DateTimeFormat('ko-KR', { ...KST, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

function saveView() { try { sessionStorage.setItem(KEY, JSON.stringify({ view, y: window.scrollY })) } catch (_) {} }

function banners() {
  const box = $('banners'); box.replaceChildren()
  const m = state.meta || {}
  if (mode === 'offline') box.append(h('div', { class: 'banner info' }, '오프라인입니다. 마지막으로 저장된 기사를 보여 드려요.'))
  if (m.last_error) {
    const since = m.last_success_at ? `마지막 갱신 ${hm(m.last_success_at)} 이후 실패` : '갱신에 실패했습니다'
    box.append(h('div', { class: 'banner err', role: 'alert' }, `${since} · 이전 기사를 보여 드려요.`))
  }
  if (m.last_success_at && m.stale_after_sec && m.server_time) {
    const age = m.server_time - new Date(m.last_success_at).getTime() / 1000
    if (age > m.stale_after_sec && !m.last_error) box.append(h('div', { class: 'banner warn', role: 'alert' }, `갱신이 ${rel(m.last_success_at)} 이후 멈춘 것 같아요. 서버의 스케줄러를 확인하세요.`))
  }
  if (!m.last_success_at && !m.last_error && mode === 'ok') box.append(h('div', { class: 'banner info' }, '아직 수집된 기사가 없습니다. 첫 수집이 끝나면 나타납니다.'))
}

function chips() {
  const cats = ['전체', ...state.categories.map(c => c.name)]
  $('cats').replaceChildren(...cats.map(c => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(view.cat === c), onclick: () => { view.cat = c; view.kw = ''; render(true) } }, c)))
  const cur = state.categories.find(c => c.name === view.cat)
  const kb = $('kws')
  kb.hidden = !cur
  kb.replaceChildren(...(cur ? cur.keywords.map(k => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(view.kw === k), onclick: () => { view.kw = view.kw === k ? '' : k; render(true) } }, k)) : []))
}

function card(a) {
  const img = a.image ? h('img', { class: 'thumb', src: a.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: ev => { ev.target.hidden = true } }) : null
  return h('article', { class: 'card' },
    h('a', { class: 'hit', href: a.link, target: '_blank', rel: 'noopener noreferrer' },
      h('div', { class: 'row' },
        h('div', { class: 'body' },
          h('h2', {}, a.title),
          h('div', { class: 'meta' }, h('b', {}, a.press), a.published_at ? [h('span', {}, rel(a.published_at)), h('span', {}, absKst(a.published_at) + ' KST')] : null),
          h('div', { class: 'tags' }, a.keywords.slice(0, 4).map(k => h('span', { class: 'tag' }, k)))),
        img)))
}

function render(userAction = false) {
  banners(); chips()
  const q = view.q.trim().toLowerCase()
  const list = state.articles.filter(a =>
    (view.cat === '전체' || a.category === view.cat) &&
    (!view.kw || a.keywords.includes(view.kw)) &&
    (!q || a.title.toLowerCase().includes(q) || a.keywords.some(k => k.toLowerCase().includes(q))))
  const main = $('list')
  if (mode === 'loading') main.replaceChildren(...Array.from({ length: 6 }, () => h('div', { class: 'skel' })))
  else if (!list.length) main.replaceChildren(h('p', { class: 'empty' }, state.articles.length ? '조건에 맞는 기사가 없습니다.' : '표시할 기사가 없습니다.'))
  else main.replaceChildren(...list.map(card))
  const m = state.meta || {}
  $('updated').textContent = m.last_success_at ? `${hm(m.last_success_at)} 갱신` : ''
  if (userAction) window.scrollTo(0, 0)
  saveView()
}

async function load(manual = false) {
  const btn = $('refresh'); btn.classList.add('spin')
  try {
    const res = await fetch('/api/news', { cache: 'no-store' })
    if (!res.ok) throw new Error(String(res.status))
    state = await res.json()
    mode = res.headers.get('X-From-Cache') ? 'offline' : 'ok'
  } catch (_) {
    mode = 'offline'
  } finally {
    btn.classList.remove('spin')
  }
  render()
  if (!manual) restoreScroll()
}

let restored = false
function restoreScroll() {
  if (restored) return; restored = true
  try { const y = JSON.parse(sessionStorage.getItem(KEY) || '{}').y; if (y) requestAnimationFrame(() => window.scrollTo(0, y)) } catch (_) {}
}

$('q').value = view.q
$('q').addEventListener('input', e => { view.q = e.target.value; render() })
$('refresh').addEventListener('click', () => load(true))
let t; window.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(saveView, 150) }, { passive: true })
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(true) }) // 홈 화면 앱으로 돌아왔을 때 저장된 최신 결과 다시 읽기
window.addEventListener('online', () => load(true))
window.addEventListener('offline', () => { if (state.articles.length) { mode = 'offline'; render() } })

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
render()
load()

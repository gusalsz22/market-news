"""WebKit(iPhone 프리셋) 상태별 스크린샷 + 레이아웃 검사. 사용: python scripts/shots.py <base_url> <out_dir>"""
import json, sys, re
from playwright.sync_api import sync_playwright

base, out = sys.argv[1:3]
SIZES = {"iphone-se-375": "iPhone SE", "iphone-14-390": "iPhone 14", "iphone-15pm-430": "iPhone 14 Pro Max"}
problems = []

def check(page, tag):
    r = page.evaluate("""() => ({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      small: [...document.querySelectorAll('button,a.hit,input')].filter(e=>e.offsetParent&&e.getBoundingClientRect().height<43.5).map(e=>e.tagName+':'+(e.textContent||'').slice(0,10)),
      fs: [...document.querySelectorAll('input')].filter(e=>parseFloat(getComputedStyle(e).fontSize)<16).length})""")
    if r["sw"] > r["cw"]: problems.append(f"{tag}: 가로 스크롤 {r['sw']}>{r['cw']}")
    if r["small"]: problems.append(f"{tag}: 터치영역<44 {r['small'][:5]}")
    if r["fs"]: problems.append(f"{tag}: 입력창 16px 미만")

def open_page(ctx):
    page = ctx.new_page(); page.goto(base + "/"); page.wait_for_selector(".card"); page.wait_for_timeout(500); return page

def patched(route, **meta):
    resp = route.fetch(); j = resp.json(); j["meta"].update(meta)
    route.fulfill(response=resp, body=json.dumps(j), headers={**resp.headers, "content-type": "application/json"})

with sync_playwright() as p:
    wk = p.webkit.launch()
    for tag, dev in SIZES.items():
        d = p.devices[dev]
        for orient in ("portrait", "landscape"):
            if orient == "landscape" and tag != "iphone-14-390": continue
            vp = d["viewport"] if orient == "portrait" else {"width": d["viewport"]["height"], "height": d["viewport"]["width"]}
            ctx = wk.new_context(**{**d, "viewport": vp, "color_scheme": "light"}); page = open_page(ctx)
            check(page, f"{tag}-{orient}"); page.screenshot(path=f"{out}/{tag}-{orient}-ok.png"); ctx.close()
    d = p.devices["iPhone 14"]
    # 필터 + 상태들
    ctx = wk.new_context(**d); page = open_page(ctx)
    page.click("#cats .chip:nth-child(3)"); page.wait_for_timeout(200); page.screenshot(path=f"{out}/filtered.png"); check(page, "filtered")
    page.evaluate("navigator.serviceWorker.ready"); page.reload(); page.wait_for_selector(".card"); page.wait_for_timeout(600)
    ctx.set_offline(True); page.click("#refresh"); page.wait_for_timeout(800); page.screenshot(path=f"{out}/offline.png")
    if "오프라인" not in page.inner_text("#banners"): problems.append("오프라인 배너 없음")
    if page.locator(".card").count() == 0: problems.append("오프라인에서 캐시 기사 없음")
    ctx.set_offline(False); ctx.close()
    # 갱신 실패 배너 / 멈춤 경고
    for name, meta, want in (("failed", {"last_error": "네이버 API 인증 실패 (HTTP 401)"}, "이후 실패"),
                             ("stale", {"last_success_at": "2026-11-05T09:00:00+09:00"}, "멈춘 것 같아요")):
        ctx = wk.new_context(**d); page = ctx.new_page(); page.route("**/api/news", (lambda m: (lambda r, *_: patched(r, **m)))(meta))
        page.goto(base + "/"); page.wait_for_selector(".card"); page.wait_for_timeout(500)
        page.screenshot(path=f"{out}/{name}.png"); txt = page.inner_text("#banners")
        if want not in txt or page.locator(".card").count() == 0: problems.append(f"{name}: 배너/이전 기사 문제 {txt!r}")
        ctx.close()
    # 첫 로딩(스켈레톤): SW 차단 + 응답 보류
    ctx = wk.new_context(**d, service_workers="block"); page = ctx.new_page(); held = []
    page.route("**/api/news", lambda r: held.append(r)); page.goto(base + "/"); page.wait_for_selector(".skel")
    page.screenshot(path=f"{out}/loading.png"); [r.continue_() for r in held]; ctx.close()
    # 다크 / 데스크톱
    ctx = wk.new_context(**d, color_scheme="dark"); page = open_page(ctx); page.screenshot(path=f"{out}/dark.png"); ctx.close()
    ctx = wk.new_context(viewport={"width": 1280, "height": 800}); page = open_page(ctx); check(page, "desktop"); page.screenshot(path=f"{out}/desktop.png")
print("PROBLEMS:", json.dumps(problems, ensure_ascii=False, indent=1) if problems else "none")

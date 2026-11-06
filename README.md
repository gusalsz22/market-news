# 마켓뉴스

네이버 뉴스 검색 API로 키워드별 기사를 **서버가 주기적으로** 모아 두고, 아이폰·데스크톱 웹앱으로 보여 줍니다. 호스팅은 Netlify(무료), 공개 사이트(로그인 없음)입니다. 화면은 저장된 결과만 읽고 네이버를 직접 부르지 않습니다.

| 역할 | 위치 |
|---|---|
| 스케줄러 | Netlify Scheduled Function `netlify/functions/crawl.mjs` (UTC 크론 `*/10`, 장 시간 외에는 코드가 60분 간격으로 건너뜀) |
| 저장소 | Netlify Blobs (`market-news` 스토어) / 로컬 스크립트는 `data/store.json` |
| 네이버 키 | Netlify 환경변수(Secret 표시) — 크롤 함수에서만 읽음. 브라우저·API 응답·git에 없음 |
| 웹 | 정적 파일(`public/`→`dist/`) + 읽기 전용 API `/api/news` |
| 접근 제어 | 없음(공개). 단, 네이버를 부르는 경로는 예약 실행뿐이고 외부에서 호출할 수 있는 크롤 엔드포인트는 없음 |

하루 호출량: 90개 검색어 × (평일 장중 6회/시 × 7시간 + 그 외 시간당 1회) ≈ 5,000회 (한도 25,000).

## 로컬
```
npm install
cp .env.example .env            # NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 입력
npm test                        # 단위 테스트
npm run crawl                   # 수동 1회 수집 → data/store.json
npm run dev                     # netlify dev: http://localhost:8888
npx netlify functions:invoke crawl --no-identity --port 8888   # dev 서버에서 예약 함수 수동 실행
```

## 배포 (Netlify)
1. `npx netlify login` → `npx netlify init`(또는 `netlify link`)으로 사이트 연결 (직접 수행)
2. 환경변수 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` 등록 — Secret 표시, 범위는 Functions 포함 (Netlify 사이트 설정 > Environment variables)
3. `npx netlify deploy --prod` 또는 연결된 저장소 푸시

예약 함수는 **게시된(production) 배포에서만** 돕니다. 프리뷰·브랜치 배포에서는 돌지 않습니다.

## 운영
- **비밀 값 바꾸기**: Netlify 환경변수 수정 후 재배포
- **검색어**: `config/keywords.json`(90개 이하). **주기·보관기간**: `config/settings.json` — 장중 주기를 바꾸면 `netlify/functions/crawl.mjs`의 크론도 같이 확인(현재 10분 단위)
- **스케줄 로그**: Netlify > Logs > Functions > `crawl` 에서 `crawl done ...` / `crawl skipped` 줄. 화면 상단의 "갱신 HH:MM"과 배너(실패·멈춤 경고)로도 확인
- **갱신 실패 시**: 이전 기사는 유지, "마지막 갱신 HH:MM 이후 실패" 배너
- **캐시**: 서비스 워커 버전은 빌드 때 파일 해시로 채워져 배포하면 자동 갱신

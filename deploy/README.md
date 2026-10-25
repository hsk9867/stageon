# 스테이지온 배포 가이드

## 구성
- 정적 사이트: `index.html`, `competitions.html`, `competition.html`, `prepare.html`, `apply.html`, `my.html` + `css/`, `js/`, `data/`
- 대회 데이터: `data/competitions.json` (단체·종목·지역·대회 목록). 이 파일만 고치면 모든 페이지에 반영됨.
- 접수 API: `worker.js` (Cloudflare Worker) + D1 (`schema.sql`)

## 1. 로컬 미리보기
`file://`로 직접 열면 fetch가 막혀 데이터가 안 나온다. 폴더에서 서버를 띄운다.
```
cd ~/stageon
python -m http.server 8080
```
→ http://localhost:8080

## 2. 정적 사이트 배포 (GitHub Pages)
```
cd ~/stageon
git init
git add .
git commit -m "init: stageon"
git branch -M main
git remote add origin https://github.com/hsk9867/stageon.git
git push -u origin main
```
GitHub → Settings → Pages → Branch: main / root.

## 3. 접수 API 배포 (Cloudflare Workers + D1)
사용자가 별도 터미널에서 직접 실행:
```
cd ~/stageon
npx wrangler login
npx wrangler d1 create stageon-db          # 출력된 database_id를 wrangler.toml에 입력
npx wrangler d1 execute stageon-db --remote --file=schema.sql
npx wrangler secret put ADMIN_TOKEN        # 관리자 조회용 토큰 (TTY 필요 - Claude Code 안에서 실행 금지)
npx wrangler deploy
```
배포 후 나온 주소(예: `https://stageon-api.xxx.workers.dev`)를 `js/app.js` 맨 위 `API_BASE`에 넣고 다시 푸시.

## 4. 접수 내역 확인
- JSON: `https://stageon-api.xxx.workers.dev/api/applications?token=ADMIN_TOKEN`
- 대회별: `...?token=ADMIN_TOKEN&competition=wngp-yangju-2026`
- 엑셀용 CSV: `...?token=ADMIN_TOKEN&format=csv`

## 5. 대회 추가/수정
`data/competitions.json`의 `competitions` 배열에 항목 추가.
```
{
  "id": "고유-id", "name": "대회명", "org": "wngp",
  "date": "2027-03-20", "region": "대구", "venue": "장소",
  "categories": ["비키니", "맨즈 피지크"],
  "types": ["일반", "내추럴", "루키·노비스"],
  "applyStart": "2027-02-01", "applyEnd": "2027-03-12",
  "fee": "100,000원",
  "applyMode": "platform",        // platform = 스테이지온 온라인 접수 / external = 단체 사이트로 이동
  "officialUrl": "", "desc": "소개"
}
```
- 접수 상태(접수 예정/접수 중/마감 임박/마감/종료)는 날짜로 자동 계산.
- `applyStart`/`applyEnd`를 비우면 "확인 필요"로 표시.
- 새 단체는 `organizations`에 `id`, `name`, `color`, `desc`를 추가.

## 6. 바꿔야 할 값
- `js/app.js` 상단 `SITE` (상호, 대표, 사업자번호, 전화, 메일)
- `wrangler.toml` `ALLOWED_ORIGIN` → 실제 도메인
- 히어로 배경: 현재 CSS 그라데이션. 사진을 쓰려면 `.ld-hero-bg-1/2`에 `background-image:url(images/hero_01.jpg)` 추가.

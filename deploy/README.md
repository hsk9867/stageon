# 스테이지온 배포 가이드

## 구성
- 정적 사이트 (GitHub Pages): `index.html` 홈 · `competitions.html` 대회 일정 · `competition.html?id=` 상세 · `apply.html?id=` 접수 · `prepare.html` 대회 준비 쇼핑 · `community.html` 커뮤니티 · `guide.html` 준비 가이드 · `my.html` 내 대회
- 데이터: `data/competitions.json` (단체·대회·포스터 경로), `data/products.json` (쇼핑 카테고리·상품·패키지)
- 포스터: `images/posters/` (unmo-*.jpg = WNGP/MUSA/ANBC, npc-*, nabba-*, mm-*)
- API: `worker.js` (Cloudflare Worker) + D1 (`schema.sql`) — 접수, 주문, 커뮤니티 글·댓글, 관리자 조회

## 1. 로컬 미리보기
```
cd ~/stageon
python -m http.server 8080
```
→ http://localhost:8080 (file:// 로 열면 JSON fetch가 막혀 데이터가 안 나옴)

## 2. 정적 사이트 배포
GitHub `hsk9867/stageon` main 브랜치 루트 → GitHub Pages 자동 반영 (https://hsk9867.github.io/stageon/)
```
cd ~/stageon
git add -A
git -c user.name=hsk9867 -c user.email=hsk9867@gmail.com commit -m "update"
git push
```

## 3. API 배포 (Cloudflare Workers + D1) — 사용자가 별도 터미널에서 직접 실행
```
cd ~/stageon
npx wrangler login
npx wrangler d1 create stageon-db          # database_id를 wrangler.toml에 입력
npx wrangler d1 execute stageon-db --remote --file=schema.sql
npx wrangler r2 bucket create stageon-images   # 커뮤니티 사진(오운완) 저장소
npx wrangler secret put ADMIN_TOKEN        # 관리자 조회·삭제용 토큰 (TTY 필요)
npx wrangler deploy
```
배포 주소(예: `https://stageon-api.xxx.workers.dev`)를 `js/app.js` 맨 위 `API_BASE`에 넣고 푸시.
API_BASE가 비어 있으면 접수·주문·커뮤니티가 각 사용자의 브라우저(localStorage)에만 저장된다 (데모 모드).

## 4. 관리자 조회
- 접수: `/api/applications?token=ADMIN_TOKEN` (`&competition=대회id`, `&format=csv`)
- 주문: `/api/orders?token=ADMIN_TOKEN` (`&format=csv`)
- 글 삭제: `POST /api/posts/{id}/delete` body `{"token":"ADMIN_TOKEN"}`

## 5. 데이터 수정
### 대회 추가 (`data/competitions.json` → `competitions`)
```
{
  "id": "wngp-xxx-2027", "name": "WNGP 수원", "org": "wngp",
  "date": "2027-03-27", "region": "경기", "venue": "루터대학교 대강당",
  "categories": ["비키니", "맨즈 피지크"], "types": ["일반", "내추럴", "루키·노비스"],
  "applyStart": "2027-02-08", "applyEnd": "2027-03-22", "fee": "180,000원 (1종목)",
  "applyMode": "platform",            // platform = 스테이지온 접수 / external = 단체 사이트 이동
  "officialUrl": "https://unmo.kr/shop/tournament_view.php?index_no=...",
  "poster": "images/posters/xxx-sq.jpg", "posterFull": "images/posters/xxx.jpg",
  "desc": "소개"
}
```
- 접수 상태(접수 예정/접수 중/마감 임박/마감/종료)는 날짜로 자동 계산. applyStart/End 비우면 "확인 필요".
- 포스터 출처: WNGP·MUSA·ANBC는 unmo.kr 대회 페이지(목록 썸네일 315/500px, 상세 에디터 이미지), NPC는 ifbbprokorea.com 대회 페이지 og:image, NABBA는 nabba.kr/img, 머슬마니아는 mmkorea.com. 새 포스터는 900px 폭 JPEG로 줄여서 넣기.

### 상품 추가 (`data/products.json` → `products`)
```
{"id": "고유id", "category": "posing|coaching|diet|supplement|gear|dayof|bodyprofile|video",
 "type": "service|product", "name": "상품명", "vendor": "업체", "price": 120000, "unit": "1회",
 "badge": "BEST|NEW|", "desc": "설명", "tags": ["#태그"], "options": ["옵션1"], "optionLabel": "옵션명"}
```
카테고리 추가는 `categories`에 `{id, name, icon, color, desc}`.

## 6. 사진 출처
- 대회 포스터: 각 단체 공식 페이지 (저작권 단체 소유, 사용 동의 권장)
- 메인 카드뉴스·히어로·오운완 샘플 사진: Wikimedia Commons 퍼블릭 도메인/CC BY 사진. 목록과 작가는 `images/photos/CREDITS.md`. CC BY 사진은 출처 표기 유지.

## 7. 바꿔야 할 값
- `js/app.js` 상단 `SITE` (상호, 대표, 사업자번호, 전화, 메일, 입금 계좌)
- `wrangler.toml` `ALLOWED_ORIGIN` → 실제 도메인
- 상품 이미지: 현재 카테고리 색상 + 이모지. 실제 사진을 쓰려면 `productCard`/모달의 `.product-img`에 이미지 경로 필드(예: `image`)를 추가.

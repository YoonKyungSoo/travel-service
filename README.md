# 같이 가는 여행 ✈️

여럿이 같이 쓰는 여행 준비 웹사이트. **중국 · 일본** 여행을 지역별로 만들고, **초대 코드**로 같이 가는 사람만 들어와요.
HTML · CSS · JS + Firebase, 빌드 과정 없음.

- 🗺️ **지도**: 고른 지역의 **구 경계 지도** (구를 누르면 그 구만 보기) + 공항 + 장소/숙소 핀 · 날짜별 동선 화살표. 지도를 **꾹 누르면** 그 자리에 장소 추가 (구·주소 자동 입력)
- 📅 **일정**: D-day, 날짜별 타임라인 (일정 + 교통 + 숙소 체크인/아웃 자동 표시)
- 🏨 **숙소·교통**: 숙소 후보 비교 → 확정 → 공항 이동 계획 (길찾기는 고덕/구글맵으로)
- 🎒 **준비물**: 나라별 기본 준비물, 담당자 지정, 진행률
- 💰 **지출**: 현지 통화/원 환산, 지출마다 나눌 사람 선택 → N빵 정산 · PDF 내역서 · 엑셀(CSV)
- 📖 **가이드**: 나라별 회화 (누르면 크게) + 직접 추가, 참고 사이트(블로그 링크), 여행 정보·초대
- 🌤️ **상단 바**: 여행지 오늘 날씨, 실시간 환율 계산기

| | 중국 | 일본 |
|---|---|---|
| 지역 | 상하이 · 베이징 · 칭다오 · 항저우 · 쑤저우 · 광저우 · 선전 · 청두 · 충칭 · 시안 · 샤먼 · 다롄 · 하얼빈 | 도쿄 · 오사카 · 교토 · 나라 · 고베 · 후쿠오카 · 삿포로 · 오키나와 · 나고야 |
| 지도 | 고덕 지도 (GCJ-02 좌표) | 국토지리원 지도 (WGS 좌표) |
| 길찾기 | 고덕 · 구글맵 | 구글맵 |
| 통화 | 위안 ¥ | 엔 ¥ (100엔 단위) |

## 폴더 구조

```
index.html            화면 뼈대
css/style.css         디자인 (모바일 → 태블릿 → PC, 인쇄용 포함)
js/config.js          ★ Firebase 설정값 넣는 곳
js/app.js             시작점 · 주소 처리 · 첫 화면(내 여행·초대 코드 참가·새 여행) · 초대하기
js/store.js           데이터 저장 (Firebase 또는 이 기기) · 초대 코드 · 여행 삭제
js/dest.js            ★ 나라·지역 설정 (지도, 통화, 공항, 길찾기, 결제수단, 나라 정보, 기본 준비물)
js/map.js             지도 · 구 경계 · 장소 · 장소 검색
js/schedule.js        일정
js/stay.js            숙소 · 교통
js/checklist.js       준비물
js/expense.js         지출 · 정산
js/links.js           가이드 (회화 · 참고 사이트 · 여행 정보)
js/phrases.js         나라별 기본 회화
js/topinfo.js         상단 날씨 · 환율 계산기
js/print.js           PDF · CSV 내보내기
js/pack.js            상하이 가이드 추천 데이터 (예전 상하이 여행 전용)
js/data.js            분류 · 상하이 구 · 기본 준비물
data/shanghai.geojson 상하이 구 경계
data/geo/*.geojson    다른 지역 구 경계 (tools/build-geo.mjs로 생성)
tools/build-geo.mjs   구 경계 데이터 만들기 (지역 추가할 때)
firestore.rules       Firebase 보안 규칙
```

## 1. GitHub Pages 배포

1. GitHub에서 `travel-service` 저장소 만들기 (Public)
2. 이 폴더의 파일을 **그대로** 올리기 (`index.html`이 저장소 맨 위에 있어야 함)
3. 저장소 **Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)`** → Save
4. 1~2분 뒤 `https://<아이디>.github.io/travel-service/` 접속

> Firebase를 설정하지 않아도 동작하지만 **이 기기에만 저장**되고, 초대 코드로 같이 쓸 수 없어요.

## 2. Firebase 연결 (같이 쓰려면 필수)

1. [Firebase 콘솔](https://console.firebase.google.com) → 프로젝트 추가 (애널리틱스는 꺼도 됨)
2. **빌드 → Authentication → 시작하기 → 로그인 방법 → 익명** 사용 설정
3. **빌드 → Firestore Database → 데이터베이스 만들기** → 위치 `asia-northeast3 (서울)` → 프로덕션 모드
4. Firestore **규칙** 탭에 `firestore.rules` 내용을 붙여넣고 **게시**
5. **프로젝트 설정 → 일반 → 내 앱 → 웹(</>)** 앱 추가 → 나오는 `firebaseConfig` 값을 `js/config.js`에 붙여넣기
6. **Authentication → 설정 → 승인된 도메인**에 `<아이디>.github.io` 추가
7. 수정한 `js/config.js`를 GitHub에 다시 올리기

> `config.js`의 값은 원래 웹페이지에 공개되는 값이라 GitHub에 올려도 괜찮아요. 데이터 보호는 보안 규칙이 담당해요.
> ⚠️ `firestore.rules`를 고쳤으면 **사이트를 올리기 전에** 콘솔에서 먼저 게시하세요.

## 3. 사용법

1. 사이트 접속 → **새 여행 만들기**: 나라 → 지역(여러 곳 가능) → 날짜 → 내 이름 · 같이 가는 사람
2. 만들면 나오는 **초대 코드(또는 초대 링크)** 를 같이 가는 사람에게 보내기
3. 받은 사람은 첫 화면 **초대 코드로 참가**에 코드와 이름 입력 → 같은 내용을 실시간으로 보고 수정
4. 휴대폰에서 **공유 → 홈 화면에 추가**하면 앱처럼 열림

- 🔒 초대 코드를 입력한 기기만 들어올 수 있어요. 코드가 새어 나가면 **가이드 → 여행 정보 → 초대하기 → 새 코드로 바꾸기**
- 📱 폰을 바꾸거나 브라우저 데이터를 지우면 코드를 한 번 다시 입력하면 돼요 (데이터는 그대로)
- 🗑️ 여행 삭제: **가이드 → 여행 정보 → 여행 수정 → 삭제** (모든 데이터가 지워지고 되돌릴 수 없어요)
- 📄 PDF: 일정 · 지출 탭 오른쪽 위 ⬇ 버튼 → 일정표 / 지출 내역서 / 둘 다 한 번에 / 엑셀(CSV)

## 중국 현지에서

- **로밍형 eSIM 데이터로 접속하세요.** Firebase(Google)는 중국 현지 회선(호텔·카페 와이파이)에서 차단돼요.
- 출국 전에 한국에서 한 번 열어두면, 연결이 잠깐 끊겨도 마지막으로 불러온 데이터는 볼 수 있어요. 입력한 내용은 연결되면 자동으로 전송돼요.
- 길찾기는 **고덕지도(Amap)**, 택시는 **디디(DiDi)** 가 정확해요. 구글맵은 VPN 없이 안 열려요.

## 지역 추가하기

1. `js/dest.js`의 `REGIONS`에 지역 추가 (중심 좌표, 범위, 공항)
2. `tools/build-geo.mjs`에 구 경계 출처(중국: DataV 도시 코드 / 일본: 시구정촌 코드)와 한국어 구 이름 추가
3. `node tools/build-geo.mjs` 실행 → `data/geo/<지역>.geojson` 생성

구 경계 출처: 중국 [DataV.GeoAtlas](https://datav.aliyun.com/portal/school/atlas/area_selector) · 일본 「国土数値情報（行政区域データ）」（国土交通省）を加工 ([japan-topography](https://github.com/smartnews-smri/japan-topography))

## 내 컴퓨터에서 미리 보기

ES 모듈을 쓰기 때문에 `index.html`을 더블클릭하면 동작하지 않아요. 간단한 서버로 열어야 해요.

```
npx serve .
```
VS Code를 쓴다면 **Live Server** 확장으로 `index.html`을 열어도 돼요.
`http://localhost:포트/?emu`로 열면 실제 DB 대신 Firebase 에뮬레이터에 연결돼요 (테스트용).

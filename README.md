# 상하이 여행 🥟

2026.12.10 ~ 12.13 상하이 여행용 웹사이트. HTML · CSS · JS + Firebase, 빌드 과정 없음.

- 🗺️ **지도**: 상하이 16개 구 경계 + 공항(푸둥 T1·훙차오) + 장소/숙소 핀. 지도를 **꾹 누르면** 그 자리에 장소 추가
- 📅 **일정**: D-day, 날짜별 타임라인 (일정 + 교통 + 숙소 체크인/아웃 자동 표시)
- 🏨 **숙소·교통**: 숙소 후보 비교(공항까지 시간 · 1박 가격) → 확정 → 공항 이동 시각 자동 계산
- 🎒 **준비물**: 담당자 지정, 진행률
- 💰 **지출**: 위안/원 환산, 빠른 입력, 1/N 정산
- 🚕 **기사님께 보여주기**: 중국어 이름·주소를 크게 표시

## 폴더 구조

```
index.html          화면 뼈대
css/style.css       디자인 (모바일 → 태블릿 → PC)
js/config.js        ★ Firebase 설정값 넣는 곳
js/app.js           시작점 · 주소 처리 · 새 여행 만들기 · 링크 공유
js/store.js         데이터 저장 (Firebase 또는 이 기기)
js/map.js           지도 · 장소
js/schedule.js      일정
js/stay.js          숙소 · 교통
js/checklist.js     준비물
js/expense.js       지출
js/data.js          구 · 공항 · 분류 · 기본 준비물/항공편
js/ui.js, util.js   공통 기능
data/shanghai.geojson  상하이 구 경계 (DataV, GCJ-02 좌표)
firestore.rules     Firebase 보안 규칙
```

## 1. GitHub Pages 배포

1. GitHub에서 `travel-service` 저장소 만들기 (Public)
2. 이 폴더의 파일을 **그대로** 올리기 (`index.html`이 저장소 맨 위에 있어야 함)
3. 저장소 **Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)`** → Save
4. 1~2분 뒤 `https://<아이디>.github.io/travel-service/` 접속

> Firebase를 설정하지 않아도 바로 동작합니다. 대신 **이 기기에만 저장**되고, 동행과 공유되지 않습니다.

## 2. Firebase 연결 (같이 쓰려면 필수)

1. [Firebase 콘솔](https://console.firebase.google.com) → 프로젝트 추가 (애널리틱스는 꺼도 됨)
2. **빌드 → Authentication → 시작하기 → 로그인 방법 → 익명** 사용 설정
3. **빌드 → Firestore Database → 데이터베이스 만들기** → 위치 `asia-northeast3 (서울)` → 프로덕션 모드
4. Firestore **규칙** 탭에 `firestore.rules` 내용을 붙여넣고 **게시**
5. **프로젝트 설정 → 일반 → 내 앱 → 웹(</>)** 앱 추가 → 나오는 `firebaseConfig` 값을 `js/config.js`에 붙여넣기
6. **Authentication → 설정 → 승인된 도메인**에 `<아이디>.github.io` 추가
7. 수정한 `js/config.js`를 GitHub에 다시 올리기

> `config.js`의 값은 원래 웹페이지에 공개되는 값이라 GitHub에 올려도 괜찮습니다. 데이터 보호는 보안 규칙이 담당합니다.

## 3. 사용법

1. 사이트 접속 → **새 여행 만들기** (내 이름 · 동행 이름 입력)
2. 나오는 **링크를 동행에게 카톡으로** 전송 → 둘이 같은 내용을 실시간으로 보고 수정
3. 휴대폰에서 **공유 → 홈 화면에 추가**하면 앱처럼 열림

⚠️ 링크가 곧 비밀번호입니다. 링크를 아는 사람은 누구나 보고 수정할 수 있으니 단체방에는 올리지 마세요.

## 중국 현지에서

- **로밍이나 VPN이 필요 없는 eSIM 데이터로 접속하세요.** Firebase(Google)는 중국 현지 회선(호텔·카페 와이파이)에서 차단됩니다.
- 출국 전에 한국에서 한 번 열어두면, 연결이 잠깐 끊겨도 마지막으로 불러온 데이터는 볼 수 있습니다. 입력한 내용은 연결되면 자동으로 전송됩니다.
- 좌표는 중국 좌표계(GCJ-02)를 씁니다. **고덕지도(Amap)**에서 복사한 좌표를 그대로 붙여넣으면 정확합니다.

## 내 컴퓨터에서 미리 보기

ES 모듈을 쓰기 때문에 `index.html`을 더블클릭하면 동작하지 않습니다. 간단한 서버로 열어야 합니다.

```
npx serve .
```
VS Code를 쓴다면 **Live Server** 확장으로 `index.html`을 열어도 됩니다.

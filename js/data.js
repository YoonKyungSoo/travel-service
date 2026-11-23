// 고정 데이터: 구, 공항, 분류, 새 여행 기본값
import { wgs2gcj } from './util.js';

// 상하이 16개 구 (adcode는 data/shanghai.geojson과 연결)
export const DISTRICTS = [
  { id: 'huangpu', adcode: 310101, ko: '황푸구', zh: '黄浦区', color: '#c8453c', small: true },
  { id: 'pudong', adcode: 310115, ko: '푸둥신구', zh: '浦东新区', color: '#3f73a8' },
  { id: 'jingan', adcode: 310106, ko: '징안구', zh: '静安区', color: '#3f8a5c', small: true },
  { id: 'xuhui', adcode: 310104, ko: '쉬후이구', zh: '徐汇区', color: '#d7832a', small: true },
  { id: 'changning', adcode: 310105, ko: '창닝구', zh: '长宁区', color: '#8a63b8', small: true },
  { id: 'hongkou', adcode: 310109, ko: '훙커우구', zh: '虹口区', color: '#b84a8a', small: true },
  { id: 'minhang', adcode: 310112, ko: '민항구', zh: '闵行区', color: '#9a6a4b' },
  { id: 'baoshan', adcode: 310113, ko: '바오산구', zh: '宝山区', color: '#2f9a9a' },
  { id: 'songjiang', adcode: 310117, ko: '쑹장구', zh: '松江区', color: '#6f8f2e' },
  { id: 'yangpu', adcode: 310110, ko: '양푸구', zh: '杨浦区', color: '#c06a6a', small: true },
  { id: 'jiading', adcode: 310114, ko: '자딩구', zh: '嘉定区', color: '#5a6fc0' },
  { id: 'jinshan', adcode: 310116, ko: '진산구', zh: '金山区', color: '#b8962e' },
  { id: 'chongming', adcode: 310151, ko: '충밍구', zh: '崇明区', color: '#4a9a6e' },
  { id: 'qingpu', adcode: 310118, ko: '칭푸구', zh: '青浦区', color: '#4a8ab8' },
  { id: 'fengxian', adcode: 310120, ko: '펑셴구', zh: '奉贤区', color: '#a85a3a' },
  { id: 'putuo', adcode: 310107, ko: '푸퉈구', zh: '普陀区', color: '#7a5ab0', small: true },
];
export const DISTRICT_BY_ID = Object.fromEntries(DISTRICTS.map((d) => [d.id, d]));
export const DISTRICT_BY_ADCODE = Object.fromEntries(DISTRICTS.map((d) => [d.adcode, d]));
export const districtName = (id) => DISTRICT_BY_ID[id]?.ko || '구 미지정';

// 공항 (WGS-84 근사 좌표 → GCJ-02)
const pvg = wgs2gcj(31.1508, 121.8018);
const sha = wgs2gcj(31.1943, 121.3268);
export const AIRPORTS = [
  { id: 'PVG', name: '푸둥 공항 T1', nameZh: '浦东国际机场 1号航站楼', lat: pvg[0], lng: pvg[1] },
  { id: 'SHA', name: '훙차오 공항', nameZh: '虹桥国际机场', lat: sha[0], lng: sha[1] },
];
export const PVG = AIRPORTS[0];

export const PLACE_CATS = {
  sight: { label: '관광', icon: '📸' },
  food: { label: '맛집', icon: '🍜' },
  cafe: { label: '카페', icon: '☕' },
  shop: { label: '쇼핑', icon: '🛍️' },
  etc: { label: '기타', icon: '📌' },
};

export const STAY_STATUS = {
  candidate: { label: '후보', cls: 'tag-gray' },
  confirmed: { label: '확정', cls: 'tag-red' },
  dropped: { label: '탈락', cls: 'tag-muted' },
};

export const TRANSPORT_TYPES = {
  flight: { label: '항공', icon: '✈️' },
  maglev: { label: '자기부상열차', icon: '🚄' },
  metro: { label: '지하철', icon: '🚇' },
  didi: { label: '디디', icon: '🚕' },
  taxi: { label: '택시', icon: '🚖' },
  train: { label: '기차', icon: '🚆' },
  walk: { label: '도보', icon: '🚶' },
  etc: { label: '기타', icon: '🧭' },
};

export const EXPENSE_CATS = {
  food: { label: '식비', icon: '🍜' },
  transport: { label: '교통', icon: '🚕' },
  stay: { label: '숙박', icon: '🏨' },
  shopping: { label: '쇼핑', icon: '🛍️' },
  sight: { label: '관광', icon: '🎫' },
  etc: { label: '기타', icon: '💳' },
};

export const PAY_METHODS = { alipay: '알리페이', wechat: '위챗페이', cash: '현금', card: '카드' };

export const CHECK_GROUPS = ['서류', '돈·결제', '전자기기', '앱 설치', '의류', '세면·상비약', '기타'];

// 새 여행을 만들 때 기본으로 들어가는 값
export const TRIP_DEFAULT = {
  name: '상하이 여행',
  startDate: '2026-12-10',
  endDate: '2026-12-13',
  fxRate: 195,
};

export const SEED = {
  transports: [
    { type: 'flight', date: '2026-12-10', depart: '16:10', arrive: '17:20', from: '인천 T1', to: '상하이 푸둥 T1', ref: '', memo: '가는 편 · 1시간 10분' },
    { type: 'flight', date: '2026-12-13', depart: '08:40', arrive: '11:55', from: '상하이 푸둥 T1', to: '인천 T1', ref: '', memo: '오는 편 · 2시간 15분 (시차 1시간 포함, 한국 시각 도착)' },
  ],
  checklist: [
    ['서류', '여권 (유효기간 6개월 이상)'],
    ['서류', '항공권 / 숙소 예약 확인서'],
    ['서류', '여행자 보험'],
    ['돈·결제', '알리페이 / 위챗페이에 해외카드 등록'],
    ['돈·결제', '소액 위안화 현금'],
    ['전자기기', 'eSIM 구매 · 설치 (출국 전)'],
    ['전자기기', '보조배터리 (기내 반입)'],
    ['전자기기', '충전기 · 케이블'],
    ['앱 설치', '알리페이'],
    ['앱 설치', '디디 (DiDi)'],
    ['앱 설치', '고덕지도 (Amap)'],
    ['앱 설치', '번역 앱 (파파고)'],
    ['의류', '겨울 외투 (12월 상하이 약 3~10℃)'],
    ['세면·상비약', '상비약 (소화제·진통제)'],
  ].map(([group, text], i) => ({ group, text, assignee: '공용', checked: false, order: i })),
};

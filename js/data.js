// 고정 데이터: 구, 공항, 분류, 새 여행 기본값

// 상하이 16개 구 (adcode는 data/shanghai.geojson과 연결). 다른 지역은 구 이름 문자열을 그대로 씀
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
/** 상하이는 구 id(huangpu…), 다른 지역은 주소에서 읽은 구 이름(渋谷区…)을 그대로 씀 */
/** 지금 지도에 불러온 구 경계의 구 정보 (id → { ko, name, color, small }). map.js가 채움 */
export const GEO_META = new Map();
export const districtName = (id) => DISTRICT_BY_ID[id]?.ko || GEO_META.get(id)?.ko || id || '구 미지정';
const PALETTE = ['#c8453c', '#3f73a8', '#3f8a5c', '#d7832a', '#8a63b8', '#b84a8a', '#2f9a9a', '#6f8f2e', '#5a6fc0', '#b8962e', '#4a8ab8', '#a85a3a'];
export function districtColor(id) {
  if (DISTRICT_BY_ID[id]) return DISTRICT_BY_ID[id].color;
  if (GEO_META.get(id)?.color) return GEO_META.get(id).color;
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}


// svg: index.html 아이콘 id, en: 작은 영문 라벨
export const PLACE_CATS = {
  sight: { label: '관광', icon: '📸', svg: 'c-sight', en: 'SIGHT' },
  activity: { label: '액티비티', icon: '🎟️', svg: 'c-activity', en: 'DO' },
  food: { label: '먹거리', icon: '🍜', svg: 'c-food', en: 'EAT' },
  cafe: { label: '카페·디저트', icon: '☕', svg: 'c-cafe', en: 'CAFE' },
  shop: { label: '쇼핑', icon: '🛍️', svg: 'c-shop', en: 'SHOP' },
  etc: { label: '기타', icon: '📌', svg: 'c-etc', en: 'ETC' },
};
export const catSvg = (cat, cls = 'i') => `<svg class="${cls}"><use href="#${(PLACE_CATS[cat] || PLACE_CATS.etc).svg}"/></svg>`;

export const STAY_STATUS = {
  candidate: { label: '후보', cls: 'tag-gray' },
  confirmed: { label: '확정', cls: 'tag-red' },
  dropped: { label: '탈락', cls: 'tag-muted' },
};


export const EXPENSE_CATS = {
  food: { label: '식비', icon: '🍜' },
  transport: { label: '교통', icon: '🚕' },
  stay: { label: '숙박', icon: '🏨' },
  shopping: { label: '쇼핑', icon: '🛍️' },
  sight: { label: '관광', icon: '🎫' },
  etc: { label: '기타', icon: '💳' },
};

export const CHECK_GROUPS = ['서류', '돈·결제', '전자기기', '앱 설치', '의류', '세면·상비약', '기타'];

// 새 여행 공통 준비물 (나라별 준비물은 dest.js의 seedChecklist가 더해짐)
export const BASE_CHECKLIST = [
  ['서류', '여권 (유효기간 6개월 이상)'],
  ['서류', '항공권 / 숙소 예약 확인서'],
  ['서류', '여행자 보험'],
  ['전자기기', '보조배터리 (기내 반입)'],
  ['전자기기', '충전기 · 케이블'],
  ['앱 설치', '번역 앱 (파파고)'],
  ['세면·상비약', '상비약 (소화제·진통제)'],
];

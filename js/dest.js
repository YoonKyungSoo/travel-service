// 목적지 설정: 나라(중국·일본) → 지역(도시). 여행마다 trip.country / trip.regions로 고름
// 좌표계: 중국 여행은 GCJ-02(고덕 지도와 같은 좌표), 일본 여행은 WGS-84(일반 GPS 좌표)
import { S } from './state.js';
import { wgs2gcj, gcj2wgs } from './util.js';

export const COUNTRIES = {
  CN: {
    id: 'CN', ko: '중국', flag: '', lang: 'zh', langKo: '중국어',
    currency: { code: 'CNY', sym: '¥', ko: '위안', unit: 1 },
    tz: 8, gcj: true, nav: 'amap',
    driverAsk: '师傅，请带我去这里',
    tiles: { url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', subdomains: '1234', attribution: '© 高德地图 · 行政区域: DataV.GeoAtlas' },
    searchLang: 'zh-CN,ko,en',
    searchHint: '한글보다 중국어·영어로 검색하면 잘 나와요.',
    info: [
      ['시차', '한국보다 1시간 느려요'],
      ['전압', '220V · 한국 플러그 대부분 그대로 (A/I형 콘센트도 있어 멀티어댑터 추천)'],
      ['결제', '알리페이·위챗페이 필수. 카드·현금은 잘 안 받는 곳도 많아요'],
      ['인터넷', '카카오톡·구글·인스타는 로밍 eSIM이면 그대로, 현지 유심·와이파이는 VPN 필요'],
      ['지도·이동', '고덕지도(Amap) + 디디(DiDi). 구글맵은 부정확해요'],
      ['긴급', '경찰 110 · 구급 120 · 화재 119'],
    ],
    seedChecklist: [
      ['돈·결제', '알리페이 / 위챗페이에 해외카드 등록'],
      ['돈·결제', '소액 위안화 현금'],
      ['전자기기', 'eSIM 구매 · 설치 (출국 전, 로밍형 추천)'],
      ['앱 설치', '알리페이'],
      ['앱 설치', '디디 (DiDi)'],
      ['앱 설치', '고덕지도 (Amap)'],
      ['앱 설치', '따종디엔핑 (Dianping)'],
      ['서류', '여권 (유효기간 6개월 이상)'],
    ],
  },
  JP: {
    id: 'JP', ko: '일본', flag: '', lang: 'ja', langKo: '일본어',
    currency: { code: 'JPY', sym: '¥', ko: '엔', unit: 100 },
    tz: 9, gcj: false, nav: 'google',
    driverAsk: 'ここまでお願いします',
    // 일본 국토지리원 지도 (무료·키 필요 없음, 일본어 지명). 확대 18까지
    tiles: { url: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', subdomains: '', attribution: '© 国土地理院 · 行政区域: 国土数値情報(国土交通省)を加工' },
    searchLang: 'ja,ko,en',
    searchHint: '일본어·영어로 검색하면 잘 나와요. (예: 浅草寺, Sensoji)',
    info: [
      ['시차', '한국과 같아요'],
      ['전압', '100V · 11자 A형 콘센트 → 돼지코(변환 플러그) 필요'],
      ['결제', '카드 대부분 가능. 작은 가게·신사는 현금만 받는 곳 있어요'],
      ['교통카드', 'Suica / PASMO / ICOCA (아이폰 지갑에 바로 추가 가능)'],
      ['지도·이동', '구글맵이 정확해요 (전철 환승·출구까지). 택시는 GO 앱'],
      ['긴급', '경찰 110 · 구급·화재 119'],
    ],
    seedChecklist: [
      ['전자기기', '돼지코 (11자 변환 플러그)'],
      ['전자기기', 'eSIM / 포켓와이파이'],
      ['돈·결제', '엔화 현금 (동전 지갑)'],
      ['돈·결제', '트래블 카드 (해외결제 수수료 무료)'],
      ['앱 설치', '구글맵'],
      ['앱 설치', 'Suica / PASMO (아이폰 지갑)'],
      ['앱 설치', 'GO 택시'],
      ['서류', '여권 · Visit Japan Web 등록'],
    ],
  },
};

const A = (id, name, nameLocal, wlat, wlng) => ({ id, name, nameLocal, wgs: [wlat, wlng] });
// bbox: [남, 서, 북, 동] (WGS)
export const REGIONS = [
  // ───── 중국 ─────
  { id: 'shanghai', country: 'CN', ko: '상하이', local: '上海', center: [31.2304, 121.4737], bbox: [30.68, 120.85, 31.88, 122.0], geo: 'data/shanghai.geojson',
    airports: [A('PVG', '푸둥 공항 T1', '浦东国际机场 1号航站楼', 31.1508, 121.8018), A('SHA', '훙차오 공항 T1', '虹桥国际机场 1号航站楼', 31.1975, 121.3410)] },
  { id: 'beijing', country: 'CN', ko: '베이징', local: '北京', center: [39.9042, 116.4074], bbox: [39.4, 115.4, 41.1, 117.5],
    airports: [A('PEK', '서우두 공항', '首都国际机场', 40.0799, 116.6031), A('PKX', '다싱 공항', '大兴国际机场', 39.5098, 116.4105)] },
  { id: 'qingdao', country: 'CN', ko: '칭다오', local: '青岛', center: [36.0671, 120.3826], bbox: [35.6, 119.5, 36.9, 121.0],
    airports: [A('TAO', '자오둥 공항', '胶东国际机场', 36.3615, 120.0883)] },
  { id: 'hangzhou', country: 'CN', ko: '항저우', local: '杭州', center: [30.2741, 120.1551], bbox: [29.9, 119.6, 30.6, 120.7],
    airports: [A('HGH', '샤오산 공항', '萧山国际机场', 30.2295, 120.4344)] },
  { id: 'suzhou', country: 'CN', ko: '쑤저우', local: '苏州', center: [31.2990, 120.5853], bbox: [30.75, 119.9, 32.05, 121.35], airports: [] },
  { id: 'guangzhou', country: 'CN', ko: '광저우', local: '广州', center: [23.1291, 113.2644], bbox: [22.5, 112.9, 23.95, 114.05],
    airports: [A('CAN', '바이윈 공항', '白云国际机场', 23.3924, 113.2988)] },
  { id: 'shenzhen', country: 'CN', ko: '선전', local: '深圳', center: [22.5431, 114.0579], bbox: [22.4, 113.7, 22.9, 114.65],
    airports: [A('SZX', '바오안 공항', '宝安国际机场', 22.6393, 113.8107)] },
  { id: 'chengdu', country: 'CN', ko: '청두', local: '成都', center: [30.5728, 104.0668], bbox: [30.1, 102.9, 31.45, 104.9],
    airports: [A('TFU', '톈푸 공항', '天府国际机场', 30.3197, 104.4413), A('CTU', '솽류 공항', '双流国际机场', 30.5785, 103.9471)] },
  { id: 'chongqing', country: 'CN', ko: '충칭', local: '重庆', center: [29.5630, 106.5516], bbox: [29.2, 106.2, 29.95, 107.0],
    airports: [A('CKG', '장베이 공항', '江北国际机场', 29.7192, 106.6417)] },
  { id: 'xian', country: 'CN', ko: '시안', local: '西安', center: [34.3416, 108.9398], bbox: [33.7, 107.6, 34.75, 109.8],
    airports: [A('XIY', '셴양 공항', '咸阳国际机场', 34.4471, 108.7516)] },
  { id: 'xiamen', country: 'CN', ko: '샤먼', local: '厦门', center: [24.4798, 118.0894], bbox: [24.35, 117.85, 24.75, 118.35],
    airports: [A('XMN', '가오치 공항', '高崎国际机场', 24.5440, 118.1277)] },
  { id: 'dalian', country: 'CN', ko: '다롄', local: '大连', center: [38.9140, 121.6147], bbox: [38.7, 121.1, 39.4, 122.2],
    airports: [A('DLC', '저우수이쯔 공항', '周水子国际机场', 38.9657, 121.5386)] },
  { id: 'harbin', country: 'CN', ko: '하얼빈', local: '哈尔滨', center: [45.8038, 126.5350], bbox: [45.5, 126.2, 46.1, 127.0],
    airports: [A('HRB', '타이핑 공항', '太平国际机场', 45.6234, 126.2503)] },
  // ───── 일본 ─────
  { id: 'tokyo', country: 'JP', ko: '도쿄', local: '東京', center: [35.6812, 139.7671], bbox: [35.3, 139.0, 35.95, 140.45],
    airports: [A('HND', '하네다 공항', '羽田空港', 35.5494, 139.7798), A('NRT', '나리타 공항', '成田空港', 35.7720, 140.3929)] },
  { id: 'osaka', country: 'JP', ko: '오사카', local: '大阪', center: [34.6937, 135.5023], bbox: [34.3, 135.1, 34.95, 135.75],
    airports: [A('KIX', '간사이 공항', '関西国際空港', 34.4320, 135.2304), A('ITM', '이타미 공항', '伊丹空港', 34.7855, 135.4382)] },
  { id: 'kyoto', country: 'JP', ko: '교토', local: '京都', center: [35.0116, 135.7681], bbox: [34.85, 135.55, 35.15, 135.9], airports: [] },
  { id: 'nara', country: 'JP', ko: '나라', local: '奈良', center: [34.6851, 135.8049], bbox: [34.6, 135.7, 34.75, 135.9], airports: [] },
  { id: 'kobe', country: 'JP', ko: '고베', local: '神戸', center: [34.6901, 135.1955], bbox: [34.6, 135.0, 34.8, 135.35], airports: [] },
  { id: 'fukuoka', country: 'JP', ko: '후쿠오카', local: '福岡', center: [33.5902, 130.4017], bbox: [33.45, 130.2, 33.75, 130.6],
    airports: [A('FUK', '후쿠오카 공항', '福岡空港', 33.5859, 130.4507)] },
  { id: 'sapporo', country: 'JP', ko: '삿포로', local: '札幌', center: [43.0618, 141.3545], bbox: [42.75, 140.95, 43.25, 141.75],
    airports: [A('CTS', '신치토세 공항', '新千歳空港', 42.7752, 141.6923)] },
  { id: 'okinawa', country: 'JP', ko: '오키나와', local: '沖縄', center: [26.2124, 127.6809], bbox: [26.05, 127.6, 26.9, 128.35],
    airports: [A('OKA', '나하 공항', '那覇空港', 26.1958, 127.6459)] },
  { id: 'nagoya', country: 'JP', ko: '나고야', local: '名古屋', center: [35.1815, 136.9066], bbox: [34.8, 136.6, 35.35, 137.15],
    airports: [A('NGO', '주부 공항', '中部国際空港', 34.8584, 136.8054)] },
];
// 모든 지역에 구 경계 데이터 (tools/build-geo.mjs로 만든 파일). 상하이는 원래 파일 그대로
REGIONS.forEach((r) => { r.geo ||= `data/geo/${r.id}.geojson`; });
export const REGION_BY_ID = Object.fromEntries(REGIONS.map((r) => [r.id, r]));
export const regionsOf = (country) => REGIONS.filter((r) => r.country === country);

/** 지금 여행의 목적지. 예전 여행(나라 정보 없음)은 상하이 */
export function dest(trip = S.trip) {
  const country = COUNTRIES[trip?.country] || COUNTRIES.CN;
  const regions = (trip?.regions?.length ? trip.regions : ['shanghai']).map((id) => REGION_BY_ID[id]).filter((r) => r && r.country === country.id);
  if (!regions.length) regions.push(regionsOf(country.id)[0]);
  const toMap = (lat, lng) => (country.gcj ? wgs2gcj(lat, lng) : [lat, lng]);
  const bbox = regions.reduce((b, r) => [Math.min(b[0], r.bbox[0]), Math.min(b[1], r.bbox[1]), Math.max(b[2], r.bbox[2]), Math.max(b[3], r.bbox[3])], [90, 180, -90, -180]);
  // 공항 = 지역 기본 공항 중 숨기지 않은 것 + 여행에서 직접 추가한 공항 (trip.airportsHidden / trip.airportsCustom)
  const hidden = new Set(trip?.airportsHidden || []);
  const airports = [
    ...regions.flatMap((r) => r.airports).filter((a) => !hidden.has(a.id)).map((a) => {
      const [lat, lng] = toMap(a.wgs[0], a.wgs[1]);
      return { id: a.id, name: a.name, nameZh: a.nameLocal, lat, lng };
    }),
    ...(trip?.airportsCustom || []).filter((a) => typeof a.lat === 'number').map((a) => ({ ...a, custom: true })), // 이미 지도 좌표
  ];
  return {
    country, regions, primary: regions[0], airports,
    bbox, // WGS
    mapBounds: [toMap(bbox[0], bbox[1]), toMap(bbox[2], bbox[3])],
    toMap, // WGS → 지도 좌표
    fromMap: (lat, lng) => (country.gcj ? gcj2wgs(lat, lng) : [lat, lng]), // 지도 좌표 → WGS
    hasGeo: regions.some((r) => r.geo),
    isShanghai: regions.some((r) => r.id === 'shanghai'),
    title: regions.map((r) => r.ko).join(' · '),
    localTitle: regions.map((r) => r.local).join('·'),
  };
}

/** 교통편 출발지/도착지 글자로 공항 고르기 (공항 이름·코드·현지 이름으로) */
export function airportFor(text, d = dest()) {
  const t = (text || '').toUpperCase();
  const alias = { SHA: /홍차오|훙차오|虹桥/ };
  return d.airports.find((a) => t.includes(a.id) || (text || '').includes(a.name.split(' ')[0]) || (text || '').includes(a.nameZh.slice(0, 2)) || alias[a.id]?.test(text || ''))
    || d.airports[0] || null;
}

/** 오늘 날짜 (여행지 시간 기준) */
export const localToday = (d = dest()) => new Date(Date.now() + d.country.tz * 3600e3).toISOString().slice(0, 10);

// ───────── 나라별 표시 ─────────
/** 현지 통화 금액 표기: ¥12.5 (위안) / ¥1,200 (엔) */
export function money(n, d = dest()) {
  const c = d.country.currency;
  const v = c.code === 'JPY' ? Math.round(n || 0) : Math.round((n || 0) * 100) / 100;
  return c.sym + v.toLocaleString('ko-KR');
}
/** 통화 선택 칸 옵션 {현지: '¥ 위안', KRW: '₩ 원'} */
export const currencyOptions = (d = dest()) => ({ [d.country.currency.code]: `${d.country.currency.sym} ${d.country.currency.ko}`, KRW: '₩ 원' });

/** 화면 문구 (현지 언어 이름 등) */
export function L10N(d = dest()) {
  const lang = d.country.langKo;
  return {
    nameLocal: `${lang} 이름`,
    addrLocal: `${lang} 주소`,
    nameLocalHint: d.country.nav === 'amap' ? '기사님께 보여주기 · 고덕 검색에 쓰여요.' : '택시 기사님께 보여주기 · 구글맵 검색에 쓰여요.',
    namePh: d.country.id === 'JP' ? '浅草寺' : '外滩',
    addrPh: d.country.id === 'JP' ? '東京都台東区浅草2-3-1' : '上海市黄浦区中山东一路',
    searchPh: `장소 · ${lang} · 태그 검색`,
  };
}

const enc = encodeURIComponent;
const kw = (p) => p.nameZh || p.name || '';
/** 장소 하나 길찾기 버튼들 (상세 화면) */
export function navButtonsHtml(item, d = dest()) {
  const ll = typeof item.lat === 'number';
  const [wl, wn] = ll ? d.fromMap(item.lat, item.lng) : [];
  const gUrl = ll && !item.approx
    ? `https://www.google.com/maps/dir/?api=1&destination=${wl.toFixed(6)},${wn.toFixed(6)}`
    : `https://www.google.com/maps/search/?api=1&query=${enc(`${kw(item)} ${d.primary.local}`)}`;
  const google = `<a class="btn" href="${gUrl}" target="_blank" rel="noopener"><svg class="i"><use href="#i-${ll && !item.approx ? 'nav' : 'search'}"/></svg>구글맵${ll && !item.approx ? ' 길찾기' : '에서 찾기'}</a>`;
  if (d.country.nav !== 'amap') return google;
  const amap = ll && !item.approx
    ? `<a class="btn" href="https://uri.amap.com/navigation?to=${item.lng},${item.lat},${enc(kw(item))}&mode=car&coordinate=gaode&callnative=1" target="_blank" rel="noopener"><svg class="i"><use href="#i-nav"/></svg>고덕 길찾기</a>`
    : `<a class="btn" href="https://uri.amap.com/search?keyword=${enc(kw(item))}&callnative=1" target="_blank" rel="noopener"><svg class="i"><use href="#i-search"/></svg>고덕에서 찾기</a>`;
  return amap + `<a class="btn" href="${gUrl}" target="_blank" rel="noopener"><svg class="i"><use href="#i-ext"/></svg>구글맵</a>`;
}
/** 두 지점 사이 길찾기 작은 링크 (동선 구간·공항 이동) */
export function navLinksHtml(a, b, d = dest()) {
  const [al, an] = d.fromMap(a.lat, a.lng), [bl, bn] = d.fromMap(b.lat, b.lng);
  const google = `<a class="mini" href="https://www.google.com/maps/dir/?api=1&origin=${al.toFixed(6)},${an.toFixed(6)}&destination=${bl.toFixed(6)},${bn.toFixed(6)}&travelmode=transit" target="_blank" rel="noopener">구글</a>`;
  if (d.country.nav !== 'amap') return google;
  const pt = (p) => `${p.lng},${p.lat},${enc(kw(p))}`;
  return `<a class="mini" href="https://uri.amap.com/navigation?from=${pt(a)}&to=${pt(b)}&mode=bus&coordinate=gaode&callnative=1" target="_blank" rel="noopener">고덕</a>${google}`;
}

/** 교통수단 (나라마다 다름) */
export function transportTypes(d = dest()) {
  const common = { flight: { label: '항공', icon: '✈️' }, metro: { label: '지하철', icon: '🚇' } };
  const tail = { taxi: { label: '택시', icon: '🚖' }, train: { label: '기차', icon: '🚆' }, bus: { label: '버스', icon: '🚌' }, walk: { label: '도보', icon: '🚶' }, etc: { label: '기타', icon: '🧭' } };
  return d.country.id === 'CN'
    ? { ...common, maglev: { label: '자기부상열차', icon: '🚄' }, didi: { label: '디디', icon: '🚕' }, ...tail }
    : { ...common, shinkansen: { label: '신칸센', icon: '🚄' }, ...tail };
}

/** 교통 탭 아래 참고 팁 */
export function transportTips(d = dest()) {
  if (d.isShanghai) return [
    '푸둥공항 ↔ 시내: <b>자기부상열차</b>(룽양루역) + 지하철 환승, 지하철 2호선 직통, 또는 디디',
    '훙차오공항 T1 ↔ 시내: 지하철 10호선, 또는 디디',
    '지하철·버스는 <b>알리페이 교통카드(乘车码)</b> QR로 탑승 가능',
  ];
  if (d.country.id === 'CN') return ['지하철·버스는 <b>알리페이 교통카드(乘车码)</b> QR로 탑승 가능', '택시는 디디(DiDi)로 부르면 목적지 설명이 필요 없어요'];
  return ['전철·버스는 <b>Suica/PASMO/ICOCA</b> 교통카드 한 장으로 (아이폰 지갑에 추가 가능)', '구글맵 대중교통 길찾기가 환승·출구까지 정확해요', '택시는 GO 앱으로 부르면 편해요'];
}

/** 결제 수단 (나라마다 다름). 예전 기록의 수단도 이름이 나오게 전체 목록도 둠 */
export const ALL_PAY = { alipay: '알리페이', wechat: '위챗페이', card: '카드', cash: '현금', ic: '교통카드', paypay: 'PayPay' };
export const payMethods = (d = dest()) => (d.country.id === 'CN'
  ? { alipay: '알리페이', wechat: '위챗페이', cash: '현금', card: '카드' }
  : { card: '카드', cash: '현금', ic: '교통카드', paypay: 'PayPay' });
/** 지출 빠른 입력: [표시, 분류, 결제수단] */
export const quickExpenses = (d = dest()) => (d.country.id === 'CN'
  ? [['🍜 식사', 'food', 'alipay'], ['☕ 커피', 'food', 'alipay'], ['🧋 버블티', 'food', 'alipay'], ['🚕 디디', 'transport', 'alipay'], ['🚇 지하철', 'transport', 'alipay'], ['🏪 편의점', 'shopping', 'alipay'], ['🎫 입장료', 'sight', 'alipay'], ['🛍️ 쇼핑', 'shopping', 'alipay']]
  : [['🍜 식사', 'food', 'card'], ['☕ 커피', 'food', 'card'], ['🍺 이자카야', 'food', 'card'], ['🚃 전철', 'transport', 'ic'], ['🚕 택시', 'transport', 'card'], ['🏪 편의점', 'shopping', 'ic'], ['🎫 입장료', 'sight', 'card'], ['🛍️ 쇼핑', 'shopping', 'card']]);
export const localNowHM = (d = dest()) => new Date(Date.now() + d.country.tz * 3600e3).toISOString().slice(11, 16);

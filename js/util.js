// 공통 유틸: HTML 이스케이프, ID, 날짜, 금액, 좌표

/** 사용자 입력을 HTML에 넣을 때 반드시 사용 */
export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** 추측 불가능한 랜덤 ID */
export function newId(len = 16) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

// ── 날짜 ──
const WD = ['일', '월', '화', '수', '목', '금', '토'];
export const parseDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const toDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** '2026-12-10' → '12/10 (목)' */
export const fmtDate = (s) => {
  if (!s) return '';
  const d = parseDate(s);
  return `${d.getMonth() + 1}/${d.getDate()} (${WD[d.getDay()]})`;
};
export function dateRange(start, end) {
  const out = [];
  const d = parseDate(start);
  const e = parseDate(end);
  while (d <= e) { out.push(toDateStr(d)); d.setDate(d.getDate() + 1); }
  return out;
}
/** 상하이 현지(UTC+8) 기준 오늘 / 현재 시각 */
export const shanghaiToday = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
export const shanghaiNowHM = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(11, 16);
/** 'D-17' / 'DAY 2' / '' (여행 끝남) — 상하이 날짜 기준 */
export function dday(start, end) {
  const today = parseDate(shanghaiToday());
  const s = parseDate(start), e = parseDate(end);
  const diff = Math.round((s - today) / 86400000);
  if (diff > 0) return `D-${diff}`;
  if (today <= e) return `DAY ${1 - diff}`;
  return '';
}
/** 'HH:mm' 에서 분 빼기 */
export function minusMinutes(hm, min) {
  const [h, m] = hm.split(':').map(Number);
  let t = h * 60 + m - min;
  t = ((t % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// ── 금액 ──
export const won = (n) => '₩' + Math.round(n || 0).toLocaleString('ko-KR');
export const yuan = (n) => '¥' + (Math.round((n || 0) * 100) / 100).toLocaleString('ko-KR');
export const toKRW = (amount, currency, fx) => (currency === 'KRW' ? amount : amount * fx);

// ── 좌표 (중국 GCJ-02) ──
// 이 사이트는 모든 좌표를 GCJ-02로 저장합니다. (구 경계 데이터, 고덕 지도와 같은 좌표계)
// 휴대폰 GPS(WGS-84)는 wgs2gcj로 변환해서 씁니다.
const A = 6378245.0;
const EE = 0.00669342162296594323;
function tLat(x, y) {
  let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  r += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
  r += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3;
  return r;
}
function tLng(x, y) {
  let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  r += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
  r += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3;
  return r;
}
/** WGS-84 → GCJ-02, [lat, lng] */
export function wgs2gcj(lat, lng) {
  let dLat = tLat(lng - 105, lat - 35);
  let dLng = tLng(lng - 105, lat - 35);
  const radLat = (lat / 180) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sq = Math.sqrt(magic);
  dLat = (dLat * 180) / (((A * (1 - EE)) / (magic * sq)) * Math.PI);
  dLng = (dLng * 180) / ((A / sq) * Math.cos(radLat) * Math.PI);
  return [lat + dLat, lng + dLng];
}
/** GCJ-02 → WGS-84 근사 (오차 수 m) */
export function gcj2wgs(lat, lng) {
  const [gl, gn] = wgs2gcj(lat, lng);
  return [lat - (gl - lat), lng - (gn - lng)];
}
/** "31.2304, 121.4737" → [lat, lng]. 순서가 반대여도 처리. 상하이 주변이 아니면 null */
export function parseLatLng(text) {
  const s = String(text);
  // 구글맵 링크: 장소 핀 좌표(!3d위도!4d경도)가 가장 정확, 없으면 화면 중심(@위도,경도)
  const pin = s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  const at = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const q = s.match(/[?&](?:q|query|ll)=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/i);
  const hit = pin || q || at;
  if (hit) return parseLatLng(`${hit[1]}, ${hit[2]}`);
  if (/^https?:\/\//.test(s.trim())) return null; // 좌표 없는 링크(공유용 짧은 링크 등)
  const nums = s.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
  if (!nums || nums.length < 2) return null;
  let [a, b] = nums;
  if (a > 90) [a, b] = [b, a];
  if (a < 20 || a > 40 || b < 110 || b > 130) return null;
  return [a, b];
}
/** 직선거리 km */
export function distanceKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
/** 디디/택시 대략 소요시간(분): 도로 우회 1.3배, 평균 40km/h, 호출 대기 10분 */
export const estimateDriveMin = (km) => Math.round(((km * 1.3) / 40) * 60 + 10);
/** 고덕 지도(중국에서 가장 정확)로 열기 */
export const amapUrl = (lat, lng, name) =>
  `https://uri.amap.com/marker?position=${lng},${lat}&name=${encodeURIComponent(name || '')}&coordinate=gaode&callnative=1`;
/** 장소 이동 시간: 1.2km 이하는 도보, 그 이상은 택시(디디) */
export function legInfo(a, b) {
  const km = distanceKm(a, b);
  const walk = km <= 1.2;
  const min = walk ? Math.max(1, Math.round(((km * 1.3) / 4.5) * 60)) : estimateDriveMin(km);
  return { km, min, walk, label: `${km < 1 ? Math.round(km * 1000) + 'm' : km.toFixed(1) + 'km'} · ${walk ? '도보' : '택시'} ${min}분` };
}
const amapPt = (p) => `${p.lng},${p.lat},${encodeURIComponent(p.nameZh || p.name || '')}`;
/** 고덕 길찾기. from이 없으면 현재 위치에서 출발. mode: car | bus(대중교통) | walk */
export const amapNav = (to, from, mode = 'car') =>
  `https://uri.amap.com/navigation?${from ? `from=${amapPt(from)}&` : ''}to=${amapPt(to)}&mode=${mode}&coordinate=gaode&callnative=1`;
/** 고덕 키워드 검색 (체인점 등 위치가 정해지지 않은 곳) */
export const amapSearch = (kw) => `https://uri.amap.com/search?keyword=${encodeURIComponent(kw)}&city=310000&callnative=1`;
/** 구글맵 (중국 지도에서는 구글도 GCJ-02 좌표를 씀) */
export const googleUrl = (p) =>
  typeof p.lat === 'number' && !p.approx
    ? `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.nameZh || p.name} 上海`)}`;
export const googleDir = (a, b, mode = 'transit') =>
  `https://www.google.com/maps/dir/?api=1&origin=${a.lat.toFixed(6)},${a.lng.toFixed(6)}&destination=${b.lat.toFixed(6)},${b.lng.toFixed(6)}&travelmode=${mode}`;

// ── 기타 ──
export const byTime = (a, b) =>
  `${a.date || ''} ${a.time || a.depart || '99:99'}`.localeCompare(`${b.date || ''} ${b.time || b.depart || '99:99'}`);

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2200);
}

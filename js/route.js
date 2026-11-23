// 날짜별 동선: 일정(장소 연결) → 번호 핀 + 휘어진 화살표 선 + 구간 거리/시간
/* global L */
import { S, byId } from './state.js';
import { PVG } from './data.js';
import { esc, legInfo, byTime, amapNav, googleDir } from './util.js';

const flights = () => S.data.transports.filter((t) => t.type === 'flight').sort(byTime);
const confirmedStays = () => S.data.stays.filter((s) => s.status === 'confirmed' && typeof s.lat === 'number');

/** 그날 동선의 정류장 목록 (출발지 → 장소들 → 도착지) */
export function dayStops(date) {
  const fl = flights();
  const out = fl[0], ret = fl.at(-1);
  const stays = confirmedStays();
  const sleptBefore = stays.find((s) => s.checkIn < date && date <= s.checkOut); // 전날 밤 숙소
  const sleepTonight = stays.find((s) => s.checkIn <= date && date < s.checkOut); // 오늘 밤 숙소
  const airport = { kind: 'airport', lat: PVG.lat, lng: PVG.lng, name: PVG.name, nameZh: PVG.nameZh };
  const stayStop = (s) => ({ kind: 'stay', ref: s, lat: s.lat, lng: s.lng, name: s.name, nameZh: s.nameZh, id: s.id });

  const places = S.data.schedule
    .filter((s) => s.date === date && s.placeId)
    .sort(byTime)
    .map((s) => ({ s, p: byId('places', s.placeId) }))
    .filter(({ p }) => p && typeof p.lat === 'number')
    .map(({ s, p }, i) => ({ kind: 'place', n: i + 1, ref: p, sch: s, id: p.id, lat: p.lat, lng: p.lng, name: p.name, nameZh: p.nameZh, time: s.time, title: s.title }));

  const stops = [];
  if (out && out.date === date) stops.push({ ...airport, time: out.arrive, title: '도착' });
  else if (sleptBefore) stops.push({ ...stayStop(sleptBefore), title: '숙소 출발' });
  stops.push(...places);
  if (ret && ret.date === date && ret !== out) stops.push({ ...airport, time: ret.depart, title: '출국' });
  else if (sleepTonight) stops.push({ ...stayStop(sleepTonight), title: '숙소 복귀' });
  return { stops, places };
}

/** 구간 목록 */
export function legsOf(stops) {
  const legs = [];
  for (let i = 0; i < stops.length - 1; i++) legs.push({ a: stops[i], b: stops[i + 1], ...legInfo(stops[i], stops[i + 1]) });
  return legs;
}

// ── 곡선 계산 (메르카토르 좌표에서 2차 베지어) ──
const proj = (ll) => L.CRS.EPSG3857.project(L.latLng(ll.lat, ll.lng));
const unproj = (p) => L.CRS.EPSG3857.unproject(p);
function curve(a, b, bend = 0.16) {
  const A = proj(a), B = proj(b);
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
  const dx = B.x - A.x, dy = B.y - A.y;
  const C = L.point(mx - dy * bend, my + dx * bend); // 진행 방향 왼쪽으로 휘게
  const pts = [];
  const N = 36;
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    pts.push(unproj(L.point(u * u * A.x + 2 * u * t * C.x + t * t * B.x, u * u * A.y + 2 * u * t * C.y + t * t * B.y)));
  }
  // 가운데 지점과 진행 각도 (화면은 y가 아래로 증가 → 부호 반전)
  const t = 0.5, u = 0.5;
  const mid = unproj(L.point(u * u * A.x + 2 * u * t * C.x + t * t * B.x, u * u * A.y + 2 * u * t * C.y + t * t * B.y));
  const tx = 2 * u * (C.x - A.x) + 2 * t * (B.x - C.x);
  const ty = 2 * u * (C.y - A.y) + 2 * t * (B.y - C.y);
  const deg = (Math.atan2(-ty, tx) * 180) / Math.PI;
  return { pts, mid, deg };
}

function stopIcon(st) {
  const inner = st.kind === 'place' ? `<b>${st.n}</b>`
    : `<svg class="i"><use href="#${st.kind === 'stay' ? 'c-bed' : 'c-plane'}"/></svg>`;
  return L.divIcon({ className: 'stop-wrap', html: `<div class="stop k-${st.kind}">${inner}</div>`, iconSize: [0, 0] });
}

export function legLinksHtml(leg) {
  return `<a class="mini" href="${amapNav(leg.b, leg.a, leg.walk ? 'walk' : 'bus')}" target="_blank" rel="noopener">고덕</a>
    <a class="mini" href="${googleDir(leg.a, leg.b, leg.walk ? 'walking' : 'transit')}" target="_blank" rel="noopener">구글</a>`;
}

/** 지도에 그리기. onStop(stop) 클릭 콜백 */
export function drawRoute(layer, stops, onStop) {
  layer.clearLayers();
  const legs = legsOf(stops);
  legs.forEach((leg, i) => {
    if (leg.km < 0.03) return; // 같은 자리
    const { pts, mid, deg } = curve(leg.a, leg.b, i % 2 ? -0.16 : 0.16);
    L.polyline(pts, { className: 'route-casing', interactive: false }).addTo(layer);
    L.polyline(pts, { className: 'route-line', interactive: false }).addTo(layer);
    L.polyline(pts, { className: 'route-flow', interactive: false }).addTo(layer);
    // 화살표 + 거리 라벨 (누르면 길찾기)
    L.marker(mid, {
      zIndexOffset: 400,
      icon: L.divIcon({
        className: 'leg-wrap',
        iconSize: [0, 0],
        html: `<div class="leg"><i style="transform:rotate(${deg}deg)"><svg viewBox="0 0 12 12"><path d="M2 2 10 6 2 10 4 6z"/></svg></i><span>${esc(leg.label)}</span></div>`,
      }),
    }).bindPopup(`<div class="leg-pop"><b>${esc(leg.a.name)} → ${esc(leg.b.name)}</b><small>${esc(leg.label)} (직선 기준 대략)</small><div>${legLinksHtml(leg)}</div></div>`, { closeButton: false, offset: [0, -6] })
      .addTo(layer);
  });
  stops.forEach((st) => {
    L.marker([st.lat, st.lng], { icon: stopIcon(st), zIndexOffset: st.kind === 'place' ? 900 : 800 })
      .on('click', () => onStop?.(st))
      .bindTooltip(esc(st.time ? `${st.time} ${st.name}` : st.name), { direction: 'top', offset: [0, -18] })
      .addTo(layer);
  });
  return legs;
}

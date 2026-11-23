// 지도 화면: 구 경계 + 공항 + 장소/숙소 핀 + 하단 시트(목록/상세) + 위치 선택
/* global L */
import { S, add, update, remove, byId, onChange } from './state.js';
import { DISTRICTS, DISTRICT_BY_ADCODE, DISTRICT_BY_ID, AIRPORTS, PLACE_CATS, STAY_STATUS, districtName } from './data.js';
import { esc, fmtDate, dateRange, wgs2gcj, parseLatLng, amapUrl, toast } from './util.js';
import { formModal, field, input, textarea, segmented, select, showDriver, empty } from './ui.js';

const TILE_URL = 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}';
const SH_BOUNDS = [[30.68, 120.85], [31.88, 122.0]];

let map, geo, geoOutline, tileLayer, placeLayer, stayLayer, myLoc;
let geoData = null;
const featureLayers = new Map(); // adcode -> layer

// 하단 시트 상태
const view = { district: 'all', cat: 'all', q: '', detail: null }; // detail: {type:'place'|'stay', id}
const sheet = document.getElementById('sheet');
const sheetBody = document.getElementById('sheetBody');

const isDesktop = () => matchMedia('(min-width: 1024px)').matches;
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/** 두 색을 섞기 (#rrggbb) — 투명도 대신 불투명 색을 써서 바깥 테두리만 빨갛게 보이게 */
function mix(c1, c2, t) {
  const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const a = p(c1), b = p(c2);
  return '#' + a.map((v, i) => Math.round(v * t + b[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
}

const tilesOn = () => !!tileLayer && map.hasLayer(tileLayer);

function districtCounts() {
  const c = {};
  for (const p of S.data.places) if (p.district) c[p.district] = (c[p.district] || 0) + 1;
  return c;
}

function styleDistrict(feature) {
  const d = DISTRICT_BY_ADCODE[feature.properties.adcode];
  const has = (districtCounts()[d?.id] || 0) > 0;
  const base = cssVar('--map-land') || '#d5d8db';
  const selected = view.district === d?.id;
  if (tilesOn()) {
    return { color: d.color, weight: selected ? 3 : 1.5, fillColor: d.color, fillOpacity: has ? 0.18 : 0.04, opacity: 0.9 };
  }
  return {
    color: cssVar('--map-line') || '#fff',
    weight: selected ? 2.5 : 1,
    fillColor: has ? mix(d.color, base, 0.45) : base,
    fillOpacity: 1,
    opacity: 1,
  };
}

function refreshDistrictStyles() {
  if (!geo) return;
  geo.setStyle(styleDistrict);
  if (geoOutline) tilesOn() ? map.removeLayer(geoOutline) : geoOutline.addTo(map).bringToBack();
}

// ───────── 핀 ─────────
function placeIcon(p) {
  const color = DISTRICT_BY_ID[p.district]?.color || '#888';
  const icon = PLACE_CATS[p.category]?.icon || '📌';
  return L.divIcon({
    className: '',
    html: `<div class="pin ${p.visited ? 'visited' : ''}" style="--c:${color}"><span>${icon}</span></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 46],
  });
}
function stayIcon(s) {
  return L.divIcon({
    className: '',
    html: `<div class="pin stay ${s.status}"><span>🏨</span></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 46],
  });
}

function renderPins() {
  placeLayer.clearLayers();
  for (const p of S.data.places) {
    if (typeof p.lat !== 'number') continue;
    if (view.cat !== 'all' && p.category !== view.cat) continue;
    L.marker([p.lat, p.lng], { icon: placeIcon(p), title: p.name, riseOnHover: true })
      .on('click', () => openDetail('place', p.id))
      .bindTooltip(esc(p.name), { direction: 'top', offset: [0, -46] })
      .addTo(placeLayer);
  }
  stayLayer.clearLayers();
  for (const s of S.data.stays) {
    if (typeof s.lat !== 'number' || s.status === 'dropped') continue;
    L.marker([s.lat, s.lng], { icon: stayIcon(s), title: s.name, zIndexOffset: 500 })
      .on('click', () => openDetail('stay', s.id))
      .bindTooltip(`${esc(s.name)} (${STAY_STATUS[s.status].label})`, { direction: 'top', offset: [0, -46] })
      .addTo(stayLayer);
  }
}

// ───────── 하단 시트 ─────────
function setSnap(snap) {
  sheet.dataset.snap = snap;
  sheet.parentElement.dataset.snap = snap; // 버튼 위치를 시트 높이에 맞추기 위함 (CSS)
}

function filteredPlaces() {
  let places = S.data.places;
  if (view.district !== 'all') places = places.filter((p) => p.district === view.district);
  if (view.cat !== 'all') places = places.filter((p) => p.category === view.cat);
  const q = view.q.trim().toLowerCase();
  if (q) places = places.filter((p) => [p.name, p.nameZh, p.memo, districtName(p.district)].some((t) => (t || '').toLowerCase().includes(q)));
  return [...places].sort((a, b) => (a.date || '9').localeCompare(b.date || '9') || a.name.localeCompare(b.name));
}

function placeListHtml(places) {
  if (places.length) return places.map(placeRow).join('');
  const msg = view.q ? '검색 결과가 없어요 🥲'
    : view.district === 'all' ? '<b>지도를 꾹 누르면</b> 그 자리에 바로 추가돼요.<br>또는 ＋ 버튼으로 추가!'
    : '이 구엔 아직 등록된 곳이 없어요.';
  return `<li>${empty('📍', msg)}</li>`;
}

function renderSheet() {
  if (view.detail) return renderDetail();
  const counts = districtCounts();
  const places = filteredPlaces();
  const dTitle = view.district === 'all' ? '가볼 곳' : districtName(view.district);
  const districtsSorted = [...DISTRICTS].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));

  sheetBody.innerHTML = `
    <div class="sheet-head">
      <h2>${esc(dTitle)} <span class="count" id="placeCount">${places.length}</span></h2>
      ${view.district !== 'all' ? '<button type="button" class="btn sm ghost" data-district="all">전체 보기</button>' : ''}
    </div>
    <label class="search">
      <svg class="i"><use href="#i-search"/></svg>
      <input id="placeSearch" type="search" placeholder="장소 · 중국어 · 메모 검색" value="${esc(view.q)}" autocomplete="off" enterkeyhint="search" />
    </label>
    <div class="chips scroll-x">
      <button type="button" class="chip ${view.cat === 'all' ? 'on' : ''}" data-cat="all">전체</button>
      ${Object.entries(PLACE_CATS).map(([k, c]) => `<button type="button" class="chip ${view.cat === k ? 'on' : ''}" data-cat="${k}">${c.icon} ${c.label}</button>`).join('')}
    </div>
    <ul class="list" id="placeList">${placeListHtml(places)}</ul>
    <h3 class="sub">구별 보기 <small>색칠 = 장소 있음</small></h3>
    <ul class="legend">
      ${districtsSorted.map((d) => `
        <li><button type="button" data-district="${d.id}" class="${view.district === d.id ? 'on' : ''}">
          <i style="background:${counts[d.id] ? d.color : 'var(--muted-dot)'}"></i>${esc(d.ko)}
          <small>${counts[d.id] || ''}</small>
        </button></li>`).join('')}
    </ul>
    <h3 class="sub">공항</h3>
    <ul class="list">
      ${AIRPORTS.map((a) => `<li><button type="button" class="row" data-airport="${a.id}"><span class="row-ico">✈️</span><span class="row-main"><b>${esc(a.name)}</b><small>${esc(a.nameZh)}</small></span><span class="row-go">›</span></button></li>`).join('')}
    </ul>`;

  // 검색: 목록만 다시 그려서 입력 포커스 유지
  const search = sheetBody.querySelector('#placeSearch');
  search.addEventListener('input', () => {
    view.q = search.value;
    const list = filteredPlaces();
    sheetBody.querySelector('#placeList').innerHTML = placeListHtml(list);
    sheetBody.querySelector('#placeCount').textContent = list.length;
  });
  search.addEventListener('focus', () => { if (!isDesktop()) setSnap('full'); });
}

function placeRow(p) {
  const cat = PLACE_CATS[p.category] || PLACE_CATS.etc;
  const d = DISTRICT_BY_ID[p.district];
  return `<li><button type="button" class="row ${p.visited ? 'done' : ''}" data-place="${p.id}">
    <span class="row-ico" style="--c:${d?.color || '#999'}">${cat.icon}</span>
    <span class="row-main"><b>${esc(p.name)}</b><small>${esc(d?.ko || '구 미지정')}${p.date ? ' · ' + fmtDate(p.date) : ''}${p.visited ? ' · ✅ 다녀옴' : ''}</small></span>
    <span class="row-go">›</span>
  </button></li>`;
}

function renderDetail() {
  const { type, id } = view.detail;
  const item = byId(type === 'place' ? 'places' : 'stays', id);
  if (!item) { view.detail = null; return renderSheet(); }
  const isPlace = type === 'place';
  const d = DISTRICT_BY_ID[item.district];
  const meta = isPlace
    ? `${PLACE_CATS[item.category]?.icon || ''} ${PLACE_CATS[item.category]?.label || ''} · ${esc(d?.ko || '구 미지정')}${item.date ? ' · ' + fmtDate(item.date) : ''}`
    : `🏨 숙소 · <span class="tag ${STAY_STATUS[item.status].cls}">${STAY_STATUS[item.status].label}</span> · ${esc(d?.ko || '')}`;
  sheetBody.innerHTML = `
    <div class="sheet-head">
      <button type="button" class="btn sm ghost" data-back>‹ 목록</button>
      <button type="button" class="btn sm" data-edit>✏️ 수정</button>
    </div>
    <div class="detail">
      <h2>${esc(item.name)}</h2>
      ${item.nameZh ? `<p class="zh">${esc(item.nameZh)}</p>` : ''}
      <p class="muted">${meta}</p>
      ${item.addressZh ? `<p class="zh-addr">${esc(item.addressZh)}</p>` : ''}
      ${item.memo ? `<p class="memo">${esc(item.memo)}</p>` : ''}
      <div class="btn-row">
        ${item.nameZh || item.addressZh ? '<button type="button" class="btn primary" data-driver>🚕 기사님께 보여주기</button>' : ''}
        ${typeof item.lat === 'number' ? `<a class="btn" href="${amapUrl(item.lat, item.lng, item.nameZh || item.name)}" target="_blank" rel="noopener">🧭 고덕지도로 길찾기</a>` : ''}
        ${item.url ? `<a class="btn" href="${esc(item.url)}" target="_blank" rel="noopener">🔗 링크</a>` : ''}
        ${isPlace ? `<button type="button" class="btn ${item.visited ? '' : 'ghost'}" data-visited>${item.visited ? '✅ 다녀옴' : '☐ 다녀옴 표시'}</button>` : ''}
      </div>
    </div>`;
}

function openDetail(type, id) {
  view.detail = { type, id };
  renderSheet();
  if (!isDesktop()) setSnap('half');
  const item = byId(type === 'place' ? 'places' : 'stays', id);
  if (item && typeof item.lat === 'number') {
    const z = Math.max(map.getZoom(), 14);
    // 모바일: 시트에 가리지 않게 핀을 화면 위쪽으로
    const pt = map.project([item.lat, item.lng], z);
    if (!isDesktop()) pt.y += map.getSize().y * 0.22;
    map.flyTo(map.unproject(pt, z), z, { duration: 0.6 });
  }
}

function selectDistrict(id) {
  view.district = id;
  view.detail = null;
  refreshDistrictStyles();
  renderSheet();
  if (id !== 'all') {
    const d = DISTRICT_BY_ID[id];
    const layer = featureLayers.get(d.adcode);
    if (layer) map.flyToBounds(layer.getBounds(), { paddingTopLeft: [20, 20], paddingBottomRight: [20, isDesktop() ? 20 : map.getSize().y * 0.45], duration: 0.6 });
    if (!isDesktop()) setSnap('half');
  }
}

sheetBody.addEventListener('click', (e) => {
  const t = e.target.closest('button, a');
  if (!t) return;
  if (t.dataset.cat) { view.cat = t.dataset.cat; renderSheet(); renderPins(); }
  else if (t.dataset.district) selectDistrict(t.dataset.district);
  else if (t.dataset.place) openDetail('place', t.dataset.place);
  else if (t.dataset.airport) {
    const a = AIRPORTS.find((x) => x.id === t.dataset.airport);
    map.flyTo([a.lat, a.lng], 13);
    if (!isDesktop()) setSnap('peek');
  } else if ('back' in t.dataset) { view.detail = null; renderSheet(); }
  else if ('edit' in t.dataset) {
    const { type, id } = view.detail;
    type === 'place' ? placeForm(byId('places', id)) : import('./stay.js').then((m) => m.stayForm(byId('stays', id)));
  } else if ('driver' in t.dataset) {
    const { type, id } = view.detail;
    const it = byId(type === 'place' ? 'places' : 'stays', id);
    showDriver(it.nameZh || it.name, it.addressZh);
  } else if ('visited' in t.dataset) {
    const p = byId('places', view.detail.id);
    update('places', p.id, { visited: !p.visited });
  }
});

// 시트 드래그 (모바일)
(function initSheetDrag() {
  const handle = document.getElementById('sheetHandle');
  const order = ['peek', 'half', 'full'];
  let startY = 0, startH = 0, dragging = false, moved = false;
  handle.addEventListener('pointerdown', (e) => {
    if (isDesktop()) return;
    dragging = true; moved = false;
    startY = e.clientY;
    startH = sheet.getBoundingClientRect().height;
    sheet.classList.add('dragging');
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = startY - e.clientY;
    if (Math.abs(dy) > 4) moved = true;
    sheet.style.height = Math.max(90, Math.min(window.innerHeight * 0.92, startH + dy)) + 'px';
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    sheet.classList.remove('dragging');
    if (!moved) { // 탭하면 한 단계씩 순환
      setSnap(order[(order.indexOf(sheet.dataset.snap) + 1) % order.length]);
    } else {
      const ratio = sheet.getBoundingClientRect().height / window.innerHeight;
      setSnap(ratio < 0.3 ? 'peek' : ratio < 0.7 ? 'half' : 'full');
    }
    sheet.style.height = '';
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
})();

// ───────── 위치 선택 (폼에서 "지도에서 선택") ─────────
let pickResolve = null;
const pickBanner = document.getElementById('pickBanner');
export function pickOnMap() {
  return new Promise((resolve) => {
    pickResolve = resolve;
    document.body.classList.add('picking');
    document.getElementById('modal').hidden = true;
    pickBanner.hidden = false;
    setTimeout(() => map.invalidateSize(), 50);
  });
}
function endPick(latlng) {
  document.body.classList.remove('picking');
  document.getElementById('modal').hidden = false;
  pickBanner.hidden = true;
  setTimeout(() => map.invalidateSize(), 50);
  const r = pickResolve;
  pickResolve = null;
  r?.(latlng);
}
document.getElementById('pickCancel').addEventListener('click', () => endPick(null));

/** 현재 GPS 위치 (GCJ-02) */
export function myLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('위치 기능 미지원'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(wgs2gcj(p.coords.latitude, p.coords.longitude)),
      (e) => reject(e),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

/** 폼 안의 위치 입력칸 HTML */
export function locationFieldHtml(lat, lng, required) {
  const val = typeof lat === 'number' ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : '';
  return field(
    `위치${required ? ' *' : ''}`,
    `<input name="_loc" value="${val}" placeholder="31.2397, 121.4998" inputmode="text" autocomplete="off" />
     <div class="btn-row tight">
       <button type="button" class="btn sm" data-pick>🗺️ 지도에서 선택</button>
       <button type="button" class="btn sm" data-myloc>📍 내 위치</button>
     </div>`,
    '고덕지도(Amap)에서 복사한 좌표를 붙여넣어도 됩니다.',
  );
}

/** 위치칸 버튼 연결. 위치가 정해지면 구(district) 선택칸 자동 설정 */
export function bindLocationField(form) {
  const loc = form.elements._loc;
  const setLoc = ([lat, lng]) => {
    loc.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    autoDistrict();
  };
  const autoDistrict = () => {
    const ll = parseLatLng(loc.value);
    const sel = form.elements.district;
    if (ll && sel) {
      const d = detectDistrict(ll[0], ll[1]);
      if (d) sel.value = d;
    }
  };
  loc.addEventListener('change', autoDistrict);
  form.querySelector('[data-pick]').addEventListener('click', async () => {
    const ll = await pickOnMap();
    if (ll) setLoc(ll);
  });
  form.querySelector('[data-myloc]').addEventListener('click', async () => {
    try { setLoc(await myLocation()); } catch { toast('위치를 가져오지 못했어요. 위치 권한을 확인하세요.'); }
  });
}

/** 폼 값의 _loc → lat/lng */
export function takeLocation(v, required) {
  const raw = v._loc;
  delete v._loc;
  if (!raw) {
    if (required) { toast('위치를 입력하거나 지도에서 선택하세요.'); return false; }
    v.lat = undefined; v.lng = undefined;
    return true;
  }
  const ll = parseLatLng(raw);
  if (!ll) { toast('좌표 형식이 올바르지 않아요. 예) 31.2397, 121.4998'); return false; }
  [v.lat, v.lng] = ll;
  if (!v.district) v.district = detectDistrict(v.lat, v.lng);
  return true;
}

// ───────── 구 판별 (점이 어느 구 안에 있는지) ─────────
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function detectDistrict(lat, lng) {
  if (!geoData) return undefined;
  for (const f of geoData.features) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    if (polys.some((p) => inRing(lng, lat, p[0]) && !p.slice(1).some((h) => inRing(lng, lat, h)))) {
      return DISTRICT_BY_ADCODE[f.properties.adcode]?.id;
    }
  }
  return undefined;
}

export const districtOptions = () => ({ '': '자동 (위치로 판별)', ...Object.fromEntries(DISTRICTS.map((d) => [d.id, d.ko])) });

// ───────── 장소 추가/수정 폼 ─────────
/** @param preset [lat, lng] — 지도를 꾹 눌러 추가할 때 */
export function placeForm(p = null, preset = null) {
  const lat = p?.lat ?? preset?.[0];
  const lng = p?.lng ?? preset?.[1];
  const presetDistrict = p?.district || (preset ? detectDistrict(lat, lng) : '') || '';
  const days = S.trip ? dateRange(S.trip.startDate, S.trip.endDate) : [];
  formModal({
    title: p ? '장소 수정' : '장소 추가',
    canDelete: !!p,
    fields: `
      ${field('이름 *', input('name', p?.name, 'required placeholder="예) 와이탄 야경" autocomplete="off"'))}
      ${field('종류', segmented('category', Object.fromEntries(Object.entries(PLACE_CATS).map(([k, c]) => [k, `${c.icon} ${c.label}`])), p?.category || 'sight'))}
      ${locationFieldHtml(lat, lng, true)}
      ${field('구', select('district', districtOptions(), presetDistrict))}
      ${field('중국어 이름', input('nameZh', p?.nameZh, 'placeholder="外滩" autocomplete="off"'), '기사님께 보여주기에 사용됩니다.')}
      ${field('중국어 주소', input('addressZh', p?.addressZh, 'placeholder="上海市黄浦区中山东一路" autocomplete="off"'))}
      ${field('방문 예정일', select('date', { '': '미정', ...Object.fromEntries(days.map((d) => [d, fmtDate(d)])) }, p?.date || ''))}
      ${field('링크', input('url', p?.url, 'type="url" placeholder="https://"'))}
      ${field('메모', textarea('memo', p?.memo, 'placeholder="영업시간, 추천 메뉴 등"'))}
      ${p ? `<label class="check"><input type="checkbox" name="visited" ${p.visited ? 'checked' : ''} /> 다녀옴</label>` : ''}`,
    bind: bindLocationField,
    onSubmit: async (v) => {
      if (!v.name) { toast('이름을 입력하세요.'); return false; }
      if (!takeLocation(v, true)) return false;
      if (p) await update('places', p.id, v);
      else {
        const id = await add('places', { ...v, visited: false });
        setTimeout(() => openDetail('place', id), 50); // 저장 반영 후 상세 열기
      }
      toast('저장했어요.');
    },
    onDelete: async () => {
      await remove('places', p.id);
      view.detail = null;
    },
  });
}

/** 상하이 전체 보기 (모바일은 상단 바 · 하단 시트에 가리지 않게 여백) */
function fitAll(animate) {
  const opts = isDesktop()
    ? { padding: [24, 24] }
    : { paddingTopLeft: [12, 64], paddingBottomRight: [60, 150] };
  animate ? map.flyToBounds(SH_BOUNDS, { ...opts, duration: 0.6 }) : map.fitBounds(SH_BOUNDS, opts);
}

// ───────── 초기화 ─────────
export async function initMap() {
  if (map) return;
  map = L.map('map', {
    zoomControl: false,
    attributionControl: true,
    minZoom: 8,
    maxZoom: 18,
    maxBounds: [[29.8, 119.8], [32.6, 123.0]],
    zoomSnap: 0.25,
    tapHold: true, // 모바일 사파리에서 꾹 누르기 → contextmenu 이벤트
  });
  L.control.zoom({ position: 'topright' }).addTo(map);
  map.attributionControl.setPrefix(false);
  fitAll(false);

  tileLayer = L.tileLayer(TILE_URL, { subdomains: '1234', maxZoom: 18, attribution: '© 高德地图' });

  try {
    geoData = await (await fetch('data/shanghai.geojson')).json();
  } catch (e) {
    console.error(e);
    toast('구 경계 데이터를 불러오지 못했어요.');
    geoData = { type: 'FeatureCollection', features: [] };
  }

  // 바깥 테두리(빨간 선): 불투명 채우기 아래에 굵은 선을 깔아 바깥쪽 절반만 보이게
  geoOutline = L.geoJSON(geoData, { style: { color: cssVar('--map-edge') || '#ff4f3f', weight: 4, fill: false }, interactive: false }).addTo(map);
  geo = L.geoJSON(geoData, {
    style: styleDistrict,
    onEachFeature: (f, layer) => {
      featureLayers.set(f.properties.adcode, layer);
      layer.on('click', (e) => {
        if (pickResolve) return; // 위치 선택 중에는 map click 처리
        L.DomEvent.stopPropagation(e);
        const d = DISTRICT_BY_ADCODE[f.properties.adcode];
        if (d) selectDistrict(d.id);
      });
    },
  }).addTo(map);

  // 구 이름 라벨
  const labels = L.layerGroup().addTo(map);
  for (const f of geoData.features) {
    const d = DISTRICT_BY_ADCODE[f.properties.adcode];
    const c = f.properties.centroid || f.properties.center;
    if (!d || !c) continue;
    L.marker([c[1], c[0]], {
      interactive: false,
      icon: L.divIcon({ className: 'dlabel-wrap', html: `<span class="dlabel ${d.small ? 'small' : ''}">${esc(d.ko)}</span>`, iconSize: [0, 0] }),
    }).addTo(labels);
  }

  // 공항
  for (const a of AIRPORTS) {
    L.marker([a.lat, a.lng], {
      zIndexOffset: 1000,
      icon: L.divIcon({ className: 'airport-wrap', html: `<div class="airport"><i></i><span>${esc(a.name)}</span></div>`, iconSize: [0, 0] }),
    }).bindTooltip(esc(a.nameZh), { direction: 'bottom' }).addTo(map);
  }

  placeLayer = L.layerGroup().addTo(map);
  stayLayer = L.layerGroup().addTo(map);

  const updateZoomClass = () => map.getContainer().classList.toggle('zoomed', map.getZoom() >= 11);
  map.on('zoomend', updateZoomClass);
  updateZoomClass();

  // 꾹 누르기(모바일) / 우클릭(PC) → 그 위치로 장소 추가
  const quickAdd = (e) => {
    if (pickResolve) return;
    e.originalEvent?.preventDefault?.();
    if (navigator.vibrate) navigator.vibrate(15);
    placeForm(null, [e.latlng.lat, e.latlng.lng]);
  };
  map.on('contextmenu', quickAdd);

  map.on('click', (e) => {
    if (pickResolve) endPick([e.latlng.lat, e.latlng.lng]);
  });
  // 버튼
  document.getElementById('addPlaceBtn').addEventListener('click', () => placeForm());
  document.getElementById('fitBtn').addEventListener('click', () => { selectDistrict('all'); fitAll(true); });
  document.getElementById('tileBtn').addEventListener('click', () => {
    tilesOn() ? map.removeLayer(tileLayer) : tileLayer.addTo(map).bringToBack();
    document.getElementById('tileBtn').classList.toggle('on', tilesOn());
    refreshDistrictStyles();
    toast(tilesOn() ? '배경 지도 켜짐 (고덕지도)' : '배경 지도 꺼짐');
  });
  document.getElementById('locBtn').addEventListener('click', async () => {
    try {
      const ll = await myLocation();
      if (myLoc) myLoc.setLatLng(ll);
      else myLoc = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#2f7de1', fillOpacity: 1 }).addTo(map);
      map.flyTo(ll, 15);
    } catch {
      toast('위치를 가져오지 못했어요. 위치 권한을 확인하세요.');
    }
  });

  // 다크모드 전환 시 색 다시 계산
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', refreshDistrictStyles);

  onChange((what) => {
    if (what === 'places' || what === 'stays' || what === 'all') {
      refreshDistrictStyles();
      renderPins();
      renderSheet();
    }
  });
  refreshDistrictStyles();
  renderPins();
  renderSheet();
}

let fitted = false;
export function showMap() {
  if (!map) return;
  setTimeout(() => {
    map.invalidateSize();
    // 지도가 숨겨진 상태로 만들어졌으면 크기가 0이라 처음 보일 때 다시 맞춤
    if (!fitted) { fitted = true; fitAll(false); }
  }, 0);
}

/** 다른 화면에서 지도의 특정 장소로 이동 */
export function focusOnMap(type, id) {
  location.hash = `#/t/${S.key}/map`;
  setTimeout(() => openDetail(type, id), 120);
}

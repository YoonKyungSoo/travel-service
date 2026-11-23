// 지도 화면: 구 경계(축소) / 거리 지도(확대) + 장소 핀(묶음) + 날짜별 동선 + 하단 시트(목록/동선/상세)
/* global L */
import { S, add, update, remove, byId, onChange } from './state.js';
import { DISTRICTS, DISTRICT_BY_ADCODE, DISTRICT_BY_ID, AIRPORTS, PLACE_CATS, STAY_STATUS, districtName, catSvg } from './data.js';
import { esc, fmtDate, dateRange, wgs2gcj, parseLatLng, amapUrl, amapNav, amapSearch, googleUrl, toast, distanceKm } from './util.js';
import { formModal, field, input, textarea, segmented, select, showDriver, empty } from './ui.js';
import { dayStops, drawRoute, legsOf, legLinksHtml } from './route.js';

const TILE_URL = 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}';
const SH_BOUNDS = [[30.68, 120.85], [31.88, 122.0]];
const STREET_ZOOM = 12; // 이 배율 이상이면 거리 지도 자동 표시

let map, geo, geoOutline, tileLayer, placeLayer, stayLayer, routeLayer, myLoc;
let geoData = null;
let tileForced = false;
const featureLayers = new Map(); // adcode -> layer

// 화면 상태
const view = { district: 'all', cat: 'all', q: '', detail: null, day: 'all' }; // detail: {type:'place'|'stay', id}
const sheet = document.getElementById('sheet');
const sheetBody = document.getElementById('sheetBody');
const dayBar = document.getElementById('dayBar');

const isDesktop = () => matchMedia('(min-width: 1024px)').matches;
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const hasLL = (p) => typeof p?.lat === 'number';

/** 두 색 섞기 (#rrggbb) */
function mix(c1, c2, t) {
  const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const a = p(c1), b = p(c2);
  return '#' + a.map((v, i) => Math.round(v * t + b[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
}

const streetOn = () => !!tileLayer && map.hasLayer(tileLayer);

function districtCounts() {
  const c = {};
  for (const p of S.data.places) if (p.district) c[p.district] = (c[p.district] || 0) + 1;
  return c;
}

function styleDistrict(feature) {
  const d = DISTRICT_BY_ADCODE[feature.properties.adcode];
  const has = (districtCounts()[d?.id] || 0) > 0;
  const base = cssVar('--map-land') || '#e4e4e0';
  const selected = view.district === d?.id;
  if (streetOn()) {
    return { color: selected ? '#0b0b0c' : d.color, weight: selected ? 2.5 : 1, fillColor: d.color, fillOpacity: selected ? 0.08 : 0, opacity: selected ? 0.9 : 0.35, dashArray: selected ? null : '4 4' };
  }
  return {
    color: cssVar('--map-line') || '#fff',
    weight: selected ? 2.5 : 1,
    fillColor: has ? mix(d.color, base, 0.2) : base,
    fillOpacity: 1,
    opacity: 1,
  };
}

function refreshDistrictStyles() {
  if (!geo) return;
  geo.setStyle(styleDistrict);
  if (geoOutline) streetOn() ? map.removeLayer(geoOutline) : geoOutline.addTo(map).bringToBack();
}

/** 확대 배율에 따라 거리 지도 자동 켜기/끄기 */
function syncStreet() {
  const want = tileForced || map.getZoom() >= STREET_ZOOM;
  if (want === streetOn()) return;
  want ? tileLayer.addTo(map).bringToBack() : map.removeLayer(tileLayer);
  map.getContainer().classList.toggle('street', want);
  refreshDistrictStyles();
}

// ───────── 핀 ─────────
function placeIcon(p, faded) {
  return L.divIcon({
    className: 'pin-wrap',
    html: `<div class="pin cat-${p.category || 'etc'} ${p.visited ? 'visited' : ''} ${faded ? 'faded' : ''} ${p.approx ? 'approx' : ''}">${catSvg(p.category)}</div><span class="pin-label">${esc(p.name)}</span>`,
    iconSize: [0, 0],
  });
}
function stayIcon(s) {
  return L.divIcon({ className: 'pin-wrap', html: `<div class="pin stay ${s.status}">${catSvg('', 'i')}</div><span class="pin-label">${esc(s.name)}</span>`.replace('#c-etc', '#c-bed'), iconSize: [0, 0] });
}
function clusterIcon(n) {
  return L.divIcon({ className: 'pin-wrap', html: `<div class="cluster">${n}</div>`, iconSize: [0, 0] });
}

/** 화면에서 가까운 핀끼리 묶기 (확대하면 풀림) */
function clusterize(points) {
  const z = map.getZoom();
  if (z >= 15) return points.map((p) => [p]);
  const R = 34;
  const groups = [];
  for (const p of points) {
    const pt = map.project([p.lat, p.lng], z);
    const g = groups.find((gr) => gr.pt.distanceTo(pt) < R);
    if (g) g.items.push(p);
    else groups.push({ pt, items: [p] });
  }
  return groups.map((g) => g.items);
}

function renderPins() {
  placeLayer.clearLayers();
  stayLayer.clearLayers();
  const dayMode = view.day !== 'all';
  const routeIds = new Set(dayMode ? dayStops(view.day).places.map((s) => s.id) : []);
  let pts = S.data.places.filter(hasLL);
  if (view.cat !== 'all') pts = pts.filter((p) => p.category === view.cat);

  if (dayMode) {
    // 동선 모드: 동선에 없는 장소는 흐리게, 묶지 않음
    for (const p of pts) {
      if (routeIds.has(p.id)) continue;
      L.marker([p.lat, p.lng], { icon: placeIcon(p, true), title: p.name }).on('click', () => openDetail('place', p.id)).addTo(placeLayer);
    }
  } else {
    for (const group of clusterize(pts)) {
      if (group.length === 1) {
        const p = group[0];
        L.marker([p.lat, p.lng], { icon: placeIcon(p), title: p.name, riseOnHover: true })
          .on('click', () => openDetail('place', p.id))
          .addTo(placeLayer);
      } else {
        const b = L.latLngBounds(group.map((p) => [p.lat, p.lng]));
        L.marker(b.getCenter(), { icon: clusterIcon(group.length), zIndexOffset: 300 })
          .on('click', () => map.flyToBounds(b, { ...fitPad(), maxZoom: 17, duration: 0.5 }))
          .addTo(placeLayer);
      }
    }
  }
  for (const s of S.data.stays) {
    if (!hasLL(s) || s.status === 'dropped') continue;
    if (dayMode && s.status === 'confirmed') continue; // 동선에 숙소로 표시됨
    L.marker([s.lat, s.lng], { icon: stayIcon(s), title: s.name, zIndexOffset: 500 })
      .on('click', () => openDetail('stay', s.id))
      .addTo(stayLayer);
  }
}

// ───────── 날짜별 동선 ─────────
const days = () => (S.trip ? dateRange(S.trip.startDate, S.trip.endDate) : []);

function renderDayBar() {
  const ds = days();
  dayBar.innerHTML = `<button type="button" class="${view.day === 'all' ? 'on' : ''}" data-day="all">ALL</button>` +
    ds.map((d, i) => `<button type="button" class="${view.day === d ? 'on' : ''}" data-day="${d}"><small>D${i + 1}</small>${fmtDate(d).replace(/ \(.\)/, '')}</button>`).join('');
}
dayBar.addEventListener('click', (e) => {
  const b = e.target.closest('[data-day]');
  if (b) setDay(b.dataset.day);
});

function renderRoute() {
  routeLayer.clearLayers();
  if (view.day === 'all') return;
  drawRoute(routeLayer, dayStops(view.day).stops, (st) => {
    if (st.kind === 'place') openDetail('place', st.id);
    else if (st.kind === 'stay') openDetail('stay', st.id);
  });
}

export function setDay(day, fit = true) {
  view.day = day;
  view.detail = null;
  renderDayBar();
  renderPins();
  renderRoute();
  renderSheet();
  if (day === 'all') { if (fit) fitCore(true); return; }
  const { stops } = dayStops(day);
  if (fit && stops.length) {
    // 공항이 끼면 너무 멀어지므로, 장소가 있으면 장소+숙소 기준으로 맞춤
    const core = stops.filter((s) => s.kind !== 'airport');
    const pts = (core.length >= 2 ? core : stops).map((s) => [s.lat, s.lng]);
    if (pts.length === 1) map.flyTo(pts[0], 15, { duration: 0.6 });
    else map.flyToBounds(pts, { ...fitPad(), maxZoom: 16, duration: 0.6 });
  }
  if (!isDesktop() && sheet.dataset.snap === 'min') setSnap('peek');
}

// ───────── 하단 시트 ─────────
function setSnap(snap) {
  sheet.dataset.snap = snap;
  sheet.parentElement.dataset.snap = snap;
}

function filteredPlaces() {
  let places = S.data.places;
  if (view.district !== 'all') places = places.filter((p) => p.district === view.district);
  if (view.cat !== 'all') places = places.filter((p) => p.category === view.cat);
  const q = view.q.trim().toLowerCase();
  if (q) places = places.filter((p) => [p.name, p.nameZh, p.memo, p.howto, ...(p.tags || []), districtName(p.district)].some((t) => (t || '').toLowerCase().includes(q)));
  return [...places].sort((a, b) => (a.date || '9').localeCompare(b.date || '9') || a.name.localeCompare(b.name));
}

function thumb(p) {
  return p.photo
    ? `<span class="thumb"><img src="${esc(p.photo)}" alt="" loading="lazy" /></span>`
    : `<span class="thumb ico cat-${p.category || 'etc'}">${catSvg(p.category)}</span>`;
}

function placeRow(p) {
  const cat = PLACE_CATS[p.category] || PLACE_CATS.etc;
  const where = hasLL(p) ? districtName(p.district) : '어디서나 · 체인/배달';
  return `<li><button type="button" class="row ${p.visited ? 'done' : ''}" data-place="${p.id}">
    ${thumb(p)}
    <span class="row-main"><b>${esc(p.name)}</b><small><em class="cat-tag">${cat.en}</em>${esc(where)}${p.date ? ' · ' + fmtDate(p.date) : ''}${p.visited ? ' · 다녀옴' : ''}</small></span>
    <svg class="i row-go"><use href="#i-chev"/></svg>
  </button></li>`;
}

function placeListHtml(places) {
  const pinned = places.filter(hasLL), free = places.filter((p) => !hasLL(p));
  if (!places.length) {
    const msg = view.q ? '검색 결과가 없어요.' : view.district === 'all' ? '지도를 꾹 누르면 그 자리에 바로 추가돼요.' : '이 구엔 아직 등록된 곳이 없어요.';
    return `<li>${empty('', msg)}</li>`;
  }
  return pinned.map(placeRow).join('') + (free.length ? `<li class="list-sub">어디서나 · 체인/배달 <small>${free.length}</small></li>${free.map(placeRow).join('')}` : '');
}

function renderSheet() {
  if (view.detail) return renderDetail();
  if (view.day !== 'all') return renderDaySheet();
  const counts = districtCounts();
  const places = filteredPlaces();
  const dTitle = view.district === 'all' ? '가볼 곳' : districtName(view.district);
  const usedDistricts = DISTRICTS.filter((d) => counts[d.id]).sort((a, b) => counts[b.id] - counts[a.id]);

  sheetBody.innerHTML = `
    <div class="sheet-head">
      <h2>${esc(dTitle)} <span class="count" id="placeCount">${places.length}</span></h2>
      ${view.district !== 'all' ? '<button type="button" class="btn sm ghost" data-district="all">전체</button>' : ''}
    </div>
    <label class="search">
      <svg class="i"><use href="#i-search"/></svg>
      <input id="placeSearch" type="search" placeholder="장소 · 중국어 · 태그 검색" value="${esc(view.q)}" autocomplete="off" enterkeyhint="search" />
    </label>
    <div class="chips scroll-x">
      <button type="button" class="chip ${view.cat === 'all' ? 'on' : ''}" data-cat="all">전체</button>
      ${Object.entries(PLACE_CATS).filter(([k]) => k !== 'etc').map(([k, c]) => `<button type="button" class="chip ${view.cat === k ? 'on' : ''}" data-cat="${k}">${c.label}</button>`).join('')}
    </div>
    ${usedDistricts.length > 1 ? `<div class="chips scroll-x dchips">
      ${usedDistricts.map((d) => `<button type="button" class="chip line ${view.district === d.id ? 'on' : ''}" data-district="${d.id}"><i style="background:${d.color}"></i>${esc(d.ko)} <small>${counts[d.id]}</small></button>`).join('')}
    </div>` : ''}
    <ul class="list" id="placeList">${placeListHtml(places)}</ul>
    <h3 class="sub">공항</h3>
    <ul class="list">
      ${AIRPORTS.map((a) => `<li><button type="button" class="row" data-airport="${a.id}"><span class="thumb ico">${catSvg('', 'i').replace('#c-etc', '#c-plane')}</span><span class="row-main"><b>${esc(a.name)}</b><small>${esc(a.nameZh)}</small></span><svg class="i row-go"><use href="#i-chev"/></svg></button></li>`).join('')}
    </ul>`;

  const search = sheetBody.querySelector('#placeSearch');
  search.addEventListener('input', () => {
    view.q = search.value;
    const list = filteredPlaces();
    sheetBody.querySelector('#placeList').innerHTML = placeListHtml(list);
    sheetBody.querySelector('#placeCount').textContent = list.length;
  });
  search.addEventListener('focus', () => { if (!isDesktop()) setSnap('full'); });
}

/** 동선 모드 시트: 정류장 + 구간 */
function renderDaySheet() {
  const idx = days().indexOf(view.day);
  const { stops, places } = dayStops(view.day);
  const legs = legsOf(stops);
  const total = legs.reduce((s, l) => s + l.km, 0);
  const stopRow = (st) => {
    const mark = st.kind === 'place' ? `<b>${st.n}</b>` : `<svg class="i"><use href="#${st.kind === 'stay' ? 'c-bed' : 'c-plane'}"/></svg>`;
    const data = st.kind === 'place' ? `data-place="${st.id}"` : st.kind === 'stay' ? `data-stay="${st.id}"` : 'data-airport="PVG"';
    return `<li class="it-stop k-${st.kind}"><button type="button" ${data}>
      <span class="it-mark">${mark}</span>
      <span class="it-time">${esc(st.time || '')}</span>
      <span class="row-main"><b>${esc(st.kind === 'place' ? st.title || st.name : st.name)}</b><small>${esc(st.kind === 'place' ? (st.title !== st.name ? st.name : districtName(st.ref.district)) : st.title || '')}</small></span>
    </button></li>`;
  };
  const legRow = (lg) => `<li class="it-leg"><span>${esc(lg.label)}</span>${legLinksHtml(lg)}</li>`;
  sheetBody.innerHTML = `
    <div class="sheet-head">
      <h2><span class="eyebrow">DAY ${idx + 1}</span>${fmtDate(view.day)}</h2>
      <button type="button" class="btn sm ghost" data-day-all>전체 지도</button>
    </div>
    <p class="day-sum">장소 <b>${places.length}</b>곳 · 이동 <b>${total.toFixed(1)}</b>km <small>(직선 기준)</small></p>
    ${places.length ? `<ol class="itin">${stops.map((st, i) => stopRow(st) + (legs[i] ? legRow(legs[i]) : '')).join('')}</ol>`
    : `${empty('', '이 날 장소가 연결된 일정이 없어요.<br>일정에서 <b>장소 연결</b>을 고르면 여기에 동선이 그려져요.')}`}
    <div class="btn-row"><a class="btn ghost" href="#/t/${S.key}/schedule">일정 편집</a></div>`;
}

function renderDetail() {
  const { type, id } = view.detail;
  const item = byId(type === 'place' ? 'places' : 'stays', id);
  if (!item) { view.detail = null; return renderSheet(); }
  const isPlace = type === 'place';
  const d = DISTRICT_BY_ID[item.district];
  const cat = PLACE_CATS[item.category] || PLACE_CATS.etc;
  const meta = isPlace
    ? `<em class="cat-tag">${cat.en}</em>${esc(cat.label)} · ${esc(hasLL(item) ? d?.ko || '구 미지정' : '어디서나')}${item.date ? ' · ' + fmtDate(item.date) : ''}`
    : `<em class="cat-tag">STAY</em><span class="tag ${STAY_STATUS[item.status].cls}">${STAY_STATUS[item.status].label}</span> · ${esc(d?.ko || '')}`;
  const kw = item.nameZh || item.name;
  const nav = hasLL(item) && !item.approx
    ? `<a class="btn" href="${amapNav(item)}" target="_blank" rel="noopener"><svg class="i"><use href="#i-nav"/></svg>고덕 길찾기</a>`
    : `<a class="btn" href="${amapSearch(kw)}" target="_blank" rel="noopener"><svg class="i"><use href="#i-search"/></svg>고덕에서 찾기</a>`;
  sheetBody.innerHTML = `
    <div class="sheet-head">
      <button type="button" class="icon-btn" data-back aria-label="뒤로"><svg class="i"><use href="#i-back"/></svg></button>
      <div class="head-acts">
        ${isPlace ? `<button type="button" class="icon-btn ${item.visited ? 'on' : ''}" data-visited title="다녀옴"><svg class="i"><use href="#i-ok"/></svg></button>` : ''}
        <button type="button" class="icon-btn" data-edit aria-label="수정"><svg class="i"><use href="#i-edit"/></svg></button>
      </div>
    </div>
    <div class="detail">
      ${item.photo ? `<figure class="photo"><img src="${esc(item.photo)}" alt="" /></figure>` : ''}
      <p class="meta">${meta}${item.approx ? ' <span class="tag tag-gray">대표 위치</span>' : ''}${item.visited ? ' <span class="tag tag-red">다녀옴</span>' : ''}</p>
      <h2>${esc(item.name)}</h2>
      ${item.nameZh ? `<p class="zh">${esc(item.nameZh)}</p>` : ''}
      ${item.tags?.length ? `<p class="tags">${item.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</p>` : ''}
      <dl class="facts">
        ${item.howto ? `<div><dt>가는 법</dt><dd>${esc(item.howto)}</dd></div>` : ''}
        ${item.addressZh ? `<div><dt>주소</dt><dd class="zh-addr">${esc(item.addressZh)}</dd></div>` : ''}
        ${item.memo ? `<div><dt>메모</dt><dd class="pre">${esc(item.memo)}</dd></div>` : ''}
      </dl>
      <div class="acts">
        ${kw ? '<button type="button" class="btn primary wide" data-driver><svg class="i"><use href="#i-car"/></svg>기사님께 보여주기</button>' : ''}
        ${nav}
        <a class="btn" href="${googleUrl(item)}" target="_blank" rel="noopener"><svg class="i"><use href="#i-ext"/></svg>구글맵</a>
        ${item.url ? `<a class="btn ghost wide" href="${esc(item.url)}" target="_blank" rel="noopener"><svg class="i"><use href="#i-link"/></svg>링크 열기</a>` : ''}
      </div>
    </div>`;
}

function openDetail(type, id) {
  view.detail = { type, id };
  renderSheet();
  sheetBody.scrollTop = 0;
  if (!isDesktop()) setSnap('half');
  const item = byId(type === 'place' ? 'places' : 'stays', id);
  if (hasLL(item)) {
    const z = Math.max(map.getZoom(), 15);
    const pt = map.project([item.lat, item.lng], z);
    if (!isDesktop()) pt.y += map.getSize().y * 0.2; // 시트에 가리지 않게 위쪽으로
    map.flyTo(map.unproject(pt, z), z, { duration: 0.6 });
  }
}

function selectDistrict(id) {
  view.district = id;
  view.detail = null;
  refreshDistrictStyles();
  renderSheet();
  if (id !== 'all') {
    const layer = featureLayers.get(DISTRICT_BY_ID[id].adcode);
    const pts = S.data.places.filter((p) => p.district === id && hasLL(p));
    const b = pts.length ? L.latLngBounds(pts.map((p) => [p.lat, p.lng])) : layer?.getBounds();
    if (b) map.flyToBounds(b, { ...fitPad(), maxZoom: 16, duration: 0.6 });
    if (!isDesktop()) setSnap('half');
  }
}

sheetBody.addEventListener('click', (e) => {
  const t = e.target.closest('button, a');
  if (!t || t.tagName === 'A' && !t.dataset.dayAll) return;
  const d = t.dataset;
  if (d.cat) { view.cat = d.cat; renderSheet(); renderPins(); }
  else if (d.district) selectDistrict(d.district);
  else if (d.place) openDetail('place', d.place);
  else if (d.stay) openDetail('stay', d.stay);
  else if (d.airport) {
    const a = AIRPORTS.find((x) => x.id === d.airport);
    map.flyTo([a.lat, a.lng], 13);
    if (!isDesktop()) setSnap('peek');
  } else if ('dayAll' in d) setDay('all');
  else if ('back' in d) { view.detail = null; renderSheet(); }
  else if ('edit' in d) {
    const { type, id } = view.detail;
    type === 'place' ? placeForm(byId('places', id)) : import('./stay.js').then((m) => m.stayForm(byId('stays', id)));
  } else if ('driver' in d) {
    const { type, id } = view.detail;
    const it = byId(type === 'place' ? 'places' : 'stays', id);
    showDriver(it.nameZh || it.name, it.addressZh);
  } else if ('visited' in d) {
    const p = byId('places', view.detail.id);
    update('places', p.id, { visited: !p.visited });
  }
});

// 시트 드래그 (모바일): min(손잡이만) → peek → half → full
(function initSheetDrag() {
  const handle = document.getElementById('sheetHandle');
  const order = ['min', 'peek', 'half', 'full'];
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
    sheet.style.height = Math.max(28, Math.min(window.innerHeight * 0.92, startH + dy)) + 'px';
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    sheet.classList.remove('dragging');
    if (!moved) {
      const cur = sheet.dataset.snap;
      setSnap(cur === 'full' ? 'half' : cur === 'min' ? 'peek' : order[order.indexOf(cur) + 1]);
    } else {
      const h = sheet.getBoundingClientRect().height, vh = window.innerHeight;
      setSnap(h < 110 ? 'min' : h < vh * 0.3 ? 'peek' : h < vh * 0.68 ? 'half' : 'full');
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
export function locationFieldHtml(lat, lng, required, hint) {
  const val = typeof lat === 'number' ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : '';
  return field(
    `위치${required ? ' *' : ''}`,
    `<input name="_loc" value="${val}" placeholder="31.2397, 121.4998" inputmode="text" autocomplete="off" />
     <div class="btn-row tight">
       <button type="button" class="btn sm" data-pick>지도에서 선택</button>
       <button type="button" class="btn sm" data-myloc>내 위치</button>
     </div>`,
    hint || '구글맵 좌표(예: 31.2397, 121.4998)나 구글맵 주소창 링크를 붙여넣어도 돼요.',
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
  if (!ll) {
    toast(/^https?:/.test(raw.trim()) ? '이 링크엔 좌표가 없어요. 구글맵에서 장소를 꾹 눌러 좌표를 복사해 주세요.' : '좌표 형식이 올바르지 않아요. 예) 31.2397, 121.4998');
    return false;
  }
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
  const ds = days();
  formModal({
    title: p ? '장소 수정' : '장소 추가',
    canDelete: !!p,
    fields: `
      ${field('이름 *', input('name', p?.name, 'required placeholder="예) 와이탄 야경" autocomplete="off"'))}
      ${field('분류', segmented('category', Object.fromEntries(Object.entries(PLACE_CATS).map(([k, c]) => [k, c.label])), p?.category || 'sight'))}
      ${locationFieldHtml(lat, lng, false, '구글맵 좌표나 주소창 링크를 붙여넣어도 돼요. 체인점·배달처럼 위치가 정해지지 않았으면 비워두세요.')}
      ${field('구', select('district', districtOptions(), presetDistrict))}
      ${field('중국어 이름', input('nameZh', p?.nameZh, 'placeholder="外滩" autocomplete="off"'), '기사님께 보여주기 · 고덕 검색에 쓰여요.')}
      ${field('중국어 주소', input('addressZh', p?.addressZh, 'placeholder="上海市黄浦区中山东一路" autocomplete="off"'))}
      ${field('가는 법', input('howto', p?.howto, 'placeholder="예) 10호선 예원역" autocomplete="off"'))}
      ${field('태그', input('_tags', (p?.tags || []).join(', '), 'placeholder="야경, 산책" autocomplete="off"'), '쉼표로 구분')}
      ${field('방문 예정일', select('date', { '': '미정', ...Object.fromEntries(ds.map((d) => [d, fmtDate(d)])) }, p?.date || ''))}
      ${field('링크', input('url', p?.url, 'type="url" placeholder="https://"'))}
      ${field('메모', textarea('memo', p?.memo, 'placeholder="영업시간, 추천 메뉴 등"'))}`,
    bind: bindLocationField,
    onSubmit: async (v) => {
      if (!v.name) { toast('이름을 입력하세요.'); return false; }
      if (!takeLocation(v, false)) return false;
      v.tags = v._tags ? v._tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
      delete v._tags;
      if (hasLL(v) && p?.approx && (v.lat !== p.lat || v.lng !== p.lng)) v.approx = false; // 직접 위치를 고치면 대표 위치 표시 해제
      if (p) await update('places', p.id, v);
      else {
        const id = await add('places', { ...v, visited: false });
        setTimeout(() => openDetail('place', id), 50);
      }
      toast('저장했어요.');
    },
    onDelete: async () => {
      await remove('places', p.id);
      view.detail = null;
    },
  });
}

// ───────── 화면 맞추기 ─────────
function fitPad() {
  return isDesktop()
    ? { padding: [40, 40] }
    : { paddingTopLeft: [24, 120], paddingBottomRight: [64, Math.min(Math.round(map.getSize().y * 0.6), (sheet.dataset.snap === 'min' ? 28 : sheet.dataset.snap === 'peek' ? 188 : sheet.getBoundingClientRect().height) + 60)] };
}
/** 장소가 몰려 있는 시내 중심으로 맞추기 (디즈니·주자자오 같은 먼 곳 제외) */
function fitCore(animate) {
  map.invalidateSize();
  const pts = S.data.places.filter(hasLL);
  if (pts.length < 2) return fitAll(animate);
  const med = (arr) => [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)];
  const c = { lat: med(pts.map((p) => p.lat)), lng: med(pts.map((p) => p.lng)) };
  const core = pts.filter((p) => distanceKm(c, p) < 9);
  const b = L.latLngBounds((core.length >= 2 ? core : pts).map((p) => [p.lat, p.lng]));
  animate ? map.flyToBounds(b, { ...fitPad(), maxZoom: 15, duration: 0.6 }) : map.fitBounds(b, { ...fitPad(), maxZoom: 15 });
}
function fitAll(animate) {
  map.invalidateSize();
  const opts = isDesktop() ? { padding: [24, 24] } : { paddingTopLeft: [12, 110], paddingBottomRight: [60, 150] };
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
    tapHold: true,
  });
  L.control.zoom({ position: 'topright' }).addTo(map);
  map.attributionControl.setPrefix(false);
  fitAll(false);

  tileLayer = L.tileLayer(TILE_URL, { subdomains: '1234', maxZoom: 18, attribution: '© 高德地图', className: 'street-tiles' });

  try {
    geoData = await (await fetch('data/shanghai.geojson')).json();
  } catch (e) {
    console.error(e);
    toast('구 경계 데이터를 불러오지 못했어요.');
    geoData = { type: 'FeatureCollection', features: [] };
  }

  geoOutline = L.geoJSON(geoData, { style: { color: cssVar('--map-edge') || '#ff4f3f', weight: 3, fill: false }, interactive: false }).addTo(map);
  geo = L.geoJSON(geoData, {
    style: styleDistrict,
    onEachFeature: (f, layer) => {
      featureLayers.set(f.properties.adcode, layer);
      layer.on('click', (e) => {
        if (pickResolve || streetOn()) return; // 거리 지도에서는 구 클릭 무시
        L.DomEvent.stopPropagation(e);
        const d = DISTRICT_BY_ADCODE[f.properties.adcode];
        if (d) selectDistrict(d.id);
      });
    },
  }).addTo(map);

  // 구 이름 라벨 (축소 상태에서만)
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

  for (const a of AIRPORTS) {
    L.marker([a.lat, a.lng], {
      zIndexOffset: 1000,
      icon: L.divIcon({ className: 'airport-wrap', html: `<div class="airport"><i><svg class="i"><use href="#c-plane"/></svg></i><span>${esc(a.name)}</span></div>`, iconSize: [0, 0] }),
    }).bindTooltip(esc(a.nameZh), { direction: 'bottom' }).addTo(map);
  }

  placeLayer = L.layerGroup().addTo(map);
  stayLayer = L.layerGroup().addTo(map);
  routeLayer = L.layerGroup().addTo(map);

  const onZoom = () => {
    const z = map.getZoom();
    const el = map.getContainer();
    el.classList.toggle('zoomed', z >= 11);
    el.classList.toggle('z14', z >= 14);
    el.classList.toggle('z15', z >= 15);
    syncStreet();
    renderPins();
  };
  map.on('zoomend', onZoom);
  onZoom();

  // 꾹 누르기(모바일) / 우클릭(PC) → 그 위치로 장소 추가
  map.on('contextmenu', (e) => {
    if (pickResolve) return;
    e.originalEvent?.preventDefault?.();
    if (navigator.vibrate) navigator.vibrate(15);
    placeForm(null, [e.latlng.lat, e.latlng.lng]);
  });
  map.on('click', (e) => {
    if (pickResolve) endPick([e.latlng.lat, e.latlng.lng]);
  });

  document.getElementById('addPlaceBtn').addEventListener('click', () => placeForm());
  document.getElementById('fitBtn').addEventListener('click', () => {
    if (view.day !== 'all') return setDay(view.day);
    selectDistrict('all');
    // 한 번 누르면 시내, 시내 상태에서 또 누르면 상하이 전체
    map.getZoom() >= 12 ? fitAll(true) : fitCore(true);
  });
  document.getElementById('tileBtn').addEventListener('click', () => {
    tileForced = !tileForced;
    document.getElementById('tileBtn').classList.toggle('on', tileForced);
    syncStreet();
    toast(tileForced ? '거리 지도 항상 표시' : '거리 지도 자동 (확대하면 표시)');
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

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', refreshDistrictStyles);

  onChange((what) => {
    if (['places', 'stays', 'schedule', 'transports', 'all', 'trip'].includes(what)) {
      if (what === 'trip' || what === 'all') renderDayBar();
      refreshDistrictStyles();
      renderPins();
      renderRoute();
      renderSheet();
      if (!fitted && S.data.places.some(hasLL) && !mapEl.hidden) { fitted = true; fitCore(false); }
    }
  });
  setSnap(isDesktop() ? 'full' : 'peek');
  refreshDistrictStyles();
  renderDayBar();
  renderPins();
  renderSheet();
}

const mapEl = document.getElementById('view-map');
let fitted = false;
export function showMap() {
  if (!map) return;
  setTimeout(() => {
    map.invalidateSize();
    // 숨겨진 상태로 만들어졌으면 크기가 0이라 처음 보일 때 다시 맞춤
    if (!fitted) { fitted = S.data.places.some(hasLL); fitted ? fitCore(false) : fitAll(false); }
  }, 0);
}

/** 다른 화면에서 지도의 특정 장소로 이동 (day를 주면 그날 동선 모드로) */
export function focusOnMap(type, id, day) {
  location.hash = `#/t/${S.key}/map`;
  setTimeout(() => {
    if (day) setDay(day, !id);
    if (id) openDetail(type, id);
  }, 150);
}

/** 일정 화면에서 "지도에서 동선 보기" */
export function showDayOnMap(day) {
  location.hash = `#/t/${S.key}/map`;
  setTimeout(() => setDay(day), 150);
}

export { amapUrl };

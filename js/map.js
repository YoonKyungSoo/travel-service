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
const view = { district: 'all', cat: 'all', fav: false, q: '', detail: null, day: 'all' }; // detail: {type:'place'|'stay', id}
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
  if (view.fav) places = places.filter((p) => p.wish);
  const q = view.q.trim().toLowerCase();
  if (q) places = places.filter((p) => [p.name, p.nameZh, p.memo, p.howto, ...(p.tags || []), p.wish ? '즐겨찾기 희망 ★' : '', districtName(p.district)].some((t) => (t || '').toLowerCase().includes(q)));
  return [...places].sort((a, b) => (b.wish ? 1 : 0) - (a.wish ? 1 : 0) || (a.date || '9').localeCompare(b.date || '9') || a.name.localeCompare(b.name));
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
    <span class="row-main"><b>${p.wish ? '<svg class="i wish-star"><use href="#i-star"/></svg>' : ''}${esc(p.name)}</b><small><em class="cat-tag">${cat.en}</em>${esc(where)}${p.date ? ' · ' + fmtDate(p.date) : ''}${p.visited ? ' · 다녀옴' : ''}</small></span>
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

function catChipsHtml() {
  return `<div class="chips scroll-x">
      <button type="button" class="chip fav ${view.fav ? 'on' : ''}" data-fav><svg class="i"><use href="#i-star"/></svg>즐겨찾기 <small>${S.data.places.filter((p) => p.wish).length}</small></button>
      <button type="button" class="chip ${view.cat === 'all' && !view.fav ? 'on' : ''}" data-cat="all">전체</button>
      ${Object.entries(PLACE_CATS).filter(([k]) => k !== 'etc').map(([k, c]) => `<button type="button" class="chip ${view.cat === k ? 'on' : ''}" data-cat="${k}">${c.label}</button>`).join('')}
    </div>`;
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
    ${catChipsHtml()}
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
    const data = st.kind === 'place' ? `data-place="${st.id}"` : st.kind === 'stay' ? `data-stay="${st.id}"` : `data-airport="${st.id}"`;
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
        ${isPlace ? `<button type="button" class="icon-btn ${item.wish ? 'on' : ''}" data-wish title="즐겨찾기"><svg class="i"><use href="#i-star"/></svg></button>` : ''}
        ${isPlace ? `<button type="button" class="icon-btn ${item.visited ? 'on' : ''}" data-visited title="다녀옴"><svg class="i"><use href="#i-ok"/></svg></button>` : ''}
        <button type="button" class="icon-btn" data-edit aria-label="수정"><svg class="i"><use href="#i-edit"/></svg></button>
      </div>
    </div>
    <div class="detail">
      ${item.photo ? `<figure class="photo"><img src="${esc(item.photo)}" alt="" /></figure>` : ''}
      <p class="meta">${meta}${item.wish ? ' <span class="tag tag-red">★ 즐겨찾기</span>' : ''}${item.approx ? ' <span class="tag tag-gray">대표 위치</span>' : ''}${item.visited ? ' <span class="tag tag-red">다녀옴</span>' : ''}</p>
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
  if (d.cat) { view.cat = d.cat; if (d.cat === 'all') view.fav = false; renderSheet(); renderPins(); }
  else if ('fav' in d) { view.fav = !view.fav; renderSheet(); renderPins(); }
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
  } else if ('wish' in d) {
    const p = byId('places', view.detail.id);
    update('places', p.id, { wish: !p.wish });
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

// ───────── 위치 입력: 이름·주소 검색 → 결과 선택 → 미리보기 지도에서 확인·수정 ─────────
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const CJK = /[一-鿿]/;

/** OpenStreetMap 검색 (상하이 안에서만). 결과 좌표는 GCJ-02로 변환 */
async function searchPlaces(q) {
  const url = `${NOMINATIM}?format=jsonv2&addressdetails=1&namedetails=1&limit=8&bounded=1&viewbox=120.85,31.88,122.0,30.68&accept-language=zh-CN,ko,en&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(res.status);
  const seen = new Set();
  return (await res.json()).map((r) => {
    const [lat, lng] = wgs2gcj(+r.lat, +r.lon);
    const parts = r.display_name.split(',').map((s) => s.trim());
    const qu = parts.find((s) => /区$/.test(s)) || '';
    const a = r.address || {};
    const road = [a.road, a.pedestrian].find((s) => s && CJK.test(s)) || '';
    const nameZh = r.namedetails?.['name:zh'] || r.namedetails?.name || r.name || parts[0];
    const kind = placeKind(r.category, r.type);
    return {
      lat, lng, nameZh, kind,
      district: detectDistrict(lat, lng),
      addressZh: `上海市${qu}${road}${road && a.house_number ? a.house_number + '号' : ''}`,
      // 중국어 지명만 (영어·러시아어 등 섞인 이름은 빼기), 상하이시·중국·우편번호 제외
      line: [...new Set(parts.slice(1).filter((s) => CJK.test(s) && !/^(上海市|中国)$/.test(s)))].slice(0, 3).join(' · '),
      rank: kind.rank,
    };
  }).filter((r) => {
    if (!r.district) return false; // 상하이 밖 (쑤저우 등)
    const k = `${r.nameZh}|${r.kind.label}|${r.lat.toFixed(3)}|${r.lng.toFixed(3)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((a, b) => a.rank - b.rank);
}

/** 검색 결과 종류 (같은 이름이 여러 개 나올 때 구분용). rank가 낮을수록 위에 */
function placeKind(cat, type) {
  const T = {
    attraction: '관광지', museum: '박물관', viewpoint: '전망대', park: '공원', garden: '정원', place_of_worship: '사원',
    restaurant: '식당', fast_food: '식당', cafe: '카페', bar: '바', pub: '바', ice_cream: '디저트',
    mall: '쇼핑몰', department_store: '백화점', marketplace: '시장', hotel: '호텔', hostel: '호스텔', guest_house: '숙소',
    theme_park: '테마파크', theatre: '공연장', pedestrian: '보행가', ferry_terminal: '선착장',
  };
  if (T[type]) return { label: T[type], rank: 0 };
  if (['tourism', 'amenity', 'shop', 'leisure', 'historic'].includes(cat)) return { label: '장소', rank: 1 };
  if (cat === 'building') return { label: '건물', rank: 2 };
  if (type === 'station' || type === 'subway_entrance' || cat === 'railway') return { label: '지하철역', rank: 3 };
  if (type === 'bus_stop' || cat === 'public_transport') return { label: '버스정류장', rank: 4 };
  if (cat === 'highway') return { label: '도로', rank: 3 };
  if (cat === 'place' || cat === 'boundary') return { label: '지역', rank: 3 };
  return { label: '기타', rank: 5 };
}

/** 폼 안의 위치 입력칸 HTML. 실제 값은 숨은 칸(_loc)에 들어감 */
export function locationFieldHtml(lat, lng, required, hint) {
  const val = typeof lat === 'number' ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : '';
  return `<div class="field loc-field">
    <span class="field-label">위치${required ? ' *' : ''}</span>
    <input type="hidden" name="_loc" value="${val}" />
    <div class="loc-search">
      <input type="search" data-q placeholder="장소 이름 · 주소 검색 (예: 豫园, Yu Garden)" autocomplete="off" enterkeyhint="search" />
      <button type="button" class="btn primary" data-qbtn aria-label="검색"><svg class="i"><use href="#i-search"/></svg></button>
    </div>
    <ul class="loc-results" data-results hidden></ul>
    <div class="loc-picked" data-picked hidden>
      <div class="loc-map" data-minimap></div>
      <p class="loc-sum"><span data-sum></span><button type="button" class="btn sm ghost" data-clear>위치 지우기</button></p>
      <small class="hint">핀이 틀렸으면 핀을 끌어서 옮기세요.</small>
    </div>
    <details class="loc-more">
      <summary>검색에 안 나오면</summary>
      <div class="btn-row tight">
        <button type="button" class="btn sm" data-pick>큰 지도에서 찍기</button>
        <button type="button" class="btn sm" data-myloc>내 위치</button>
      </div>
      <input type="text" data-paste placeholder="구글맵 좌표나 주소창 링크 붙여넣기" autocomplete="off" />
    </details>
    <small class="hint">${hint || '한글보다 중국어·영어로 검색하면 잘 나와요.'}</small>
  </div>`;
}

/** 위치칸 동작 연결. 위치가 정해지면 구·중국어 이름/주소 자동 입력 */
export function bindLocationField(form) {
  const root = form.querySelector('.loc-field');
  const loc = form.elements._loc;
  const q = root.querySelector('[data-q]');
  const results = root.querySelector('[data-results]');
  const picked = root.querySelector('[data-picked]');
  const sum = root.querySelector('[data-sum]');
  let mini = null, marker = null, found = [];

  const fillIfEmpty = (name, value) => {
    const el = form.elements[name];
    if (el && value && !el.value.trim()) el.value = value;
  };
  const describe = (lat, lng) => {
    const d = detectDistrict(lat, lng);
    sum.textContent = d ? `${districtName(d)} · 선택됨` : '상하이 밖이거나 구를 알 수 없는 위치';
    const sel = form.elements.district;
    if (sel && d) sel.value = d;
  };
  const showMini = (lat, lng) => {
    picked.hidden = false;
    if (!mini) {
      mini = L.map(root.querySelector('[data-minimap]'), { zoomControl: false, attributionControl: false, dragging: true, tap: false })
        .setView([lat, lng], 16);
      L.tileLayer(TILE_URL, { subdomains: '1234', maxZoom: 18, className: 'street-tiles' }).addTo(mini);
      marker = L.marker([lat, lng], {
        draggable: true,
        icon: L.divIcon({ className: 'pin-wrap', html: '<div class="pin cat-etc"><svg class="i"><use href="#c-etc"/></svg></div>', iconSize: [0, 0] }),
      }).addTo(mini);
      marker.on('dragend', () => {
        const ll = marker.getLatLng();
        loc.value = `${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)}`;
        describe(ll.lat, ll.lng);
      });
    } else {
      marker.setLatLng([lat, lng]);
      mini.setView([lat, lng], 16);
    }
    setTimeout(() => mini.invalidateSize(), 60);
  };
  const setLoc = (lat, lng) => {
    loc.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    describe(lat, lng);
    showMini(lat, lng);
  };

  async function run() {
    const text = q.value.trim();
    if (text.length < 2) return;
    results.hidden = false;
    results.innerHTML = '<li class="loc-msg">검색 중…</li>';
    try {
      found = await searchPlaces(text);
      results.innerHTML = found.length
        ? found.map((r, i) => `<li><button type="button" data-hit="${i}"><b>${esc(r.nameZh)} <em class="cat-tag">${esc(r.kind.label)}</em></b><small>${esc(districtName(r.district))}${r.line ? ' · ' + esc(r.line) : ''}</small></button></li>`).join('')
        : `<li class="loc-msg">검색 결과가 없어요.${CJK.test(text) ? '' : ' 중국어나 영어로 검색해 보세요.'} 아래 "검색에 안 나오면"을 써도 돼요.</li>`;
    } catch {
      results.innerHTML = '<li class="loc-msg">검색 서버에 연결하지 못했어요. 아래 "큰 지도에서 찍기"를 써 주세요.</li>';
    }
  }
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
  root.querySelector('[data-qbtn]').addEventListener('click', run);
  results.addEventListener('click', (e) => {
    const b = e.target.closest('[data-hit]');
    if (!b) return;
    const r = found[b.dataset.hit];
    setLoc(r.lat, r.lng);
    if (CJK.test(r.nameZh)) fillIfEmpty('nameZh', r.nameZh);
    if (/区.+/.test(r.addressZh)) fillIfEmpty('addressZh', r.addressZh); // 도로명까지 있을 때만
    results.hidden = true;
  });
  root.querySelector('[data-clear]').addEventListener('click', () => {
    loc.value = '';
    picked.hidden = true;
  });
  root.querySelector('[data-pick]').addEventListener('click', async () => {
    const ll = await pickOnMap();
    if (ll) setLoc(ll[0], ll[1]);
  });
  root.querySelector('[data-myloc]').addEventListener('click', async () => {
    try { const [a, b] = await myLocation(); setLoc(a, b); } catch { toast('위치를 가져오지 못했어요. 위치 권한을 확인하세요.'); }
  });
  root.querySelector('[data-paste]').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
  root.querySelector('[data-paste]').addEventListener('change', (e) => {
    const raw = e.target.value.trim();
    if (!raw) return;
    const ll = parseLatLng(raw);
    if (!ll) return toast(/^https?:/.test(raw) ? '이 링크엔 좌표가 없어요. 구글맵에서 장소를 꾹 눌러 좌표를 복사해 주세요.' : '좌표 형식이 올바르지 않아요.');
    setLoc(ll[0], ll[1]);
  });

  // 수정 화면: 기존 위치 미리보기
  const cur = parseLatLng(loc.value);
  if (cur) setLoc(cur[0], cur[1]);
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
  if (!ll) { toast('위치를 다시 선택해 주세요.'); return false; }
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
      <label class="fav-check"><input type="checkbox" name="wish" ${p?.wish ? 'checked' : ''} /><svg class="i"><use href="#i-star"/></svg>즐겨찾기 <small>목록 맨 위에 보여요</small></label>
      ${field('분류', segmented('category', Object.fromEntries(Object.entries(PLACE_CATS).map(([k, c]) => [k, c.label])), p?.category || 'sight'))}
      ${locationFieldHtml(lat, lng, false, '한글보다 중국어·영어로 검색하면 잘 나와요. 체인점·배달처럼 위치가 정해지지 않았으면 비워두세요.')}
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
      if (p) v.edited = true; // 수정 화면에서 저장한 장소는 추천 데이터 갱신 때 덮어쓰지 않음
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

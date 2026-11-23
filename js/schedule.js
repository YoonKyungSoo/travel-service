// 일정: 날짜별 타임라인 (직접 넣은 일정 + 교통편 + 숙소 체크인/아웃) + 지도 동선 연결
import { S, add, update, remove, byId } from './state.js';
import { PLACE_CATS, TRANSPORT_TYPES, districtName } from './data.js';
import { esc, fmtDate, dateRange, shanghaiToday, shanghaiNowHM, toast, dday, minusMinutes } from './util.js';
import { formModal, field, input, textarea, select, empty } from './ui.js';
import { focusOnMap, showDayOnMap } from './map.js';
import { transportForm, stayForm } from './stay.js';
import { dayStops, legsOf } from './route.js';

let selDay = null;

const days = () => dateRange(S.trip.startDate, S.trip.endDate);
const svg = (id) => `<svg class="i"><use href="#${id}"/></svg>`;

/** 그날의 타임라인 항목 (시간순). sort: 정렬용 시각 */
function itemsOf(date) {
  const out = [];
  for (const s of S.data.schedule) if (s.date === date) out.push({ kind: 'schedule', time: s.time, sort: s.time, ref: s });
  const trs = S.data.transports.filter((t) => t.date === date);
  for (const t of trs) out.push({ kind: 'transport', time: t.depart, sort: t.depart, ref: t });
  for (const st of S.data.stays) {
    if (st.status !== 'confirmed') continue;
    // 체크인은 그날 첫 교통편 도착 뒤(없으면 15:00), 체크아웃은 그날 첫 출발 전(없으면 11:00)
    if (st.checkIn === date) {
      const arr = trs.map((t) => t.arrive).filter(Boolean).sort().at(-1);
      out.push({ kind: 'checkin', sort: arr ? `${arr}~` : '15:00', ref: st });
    }
    if (st.checkOut === date) {
      const dep = trs.map((t) => t.depart).filter(Boolean).sort()[0];
      out.push({ kind: 'checkout', sort: dep && dep < '11:00' ? minusMinutes(dep, 1) : '11:00', ref: st });
    }
  }
  return out.sort((a, b) => (a.sort || '99:99').localeCompare(b.sort || '99:99'));
}

function row(it, numOf) {
  if (it.kind === 'schedule') {
    const s = it.ref;
    const p = s.placeId ? byId('places', s.placeId) : null;
    const n = p ? numOf.get(s.id) : null;
    return `<li class="tl-item ${p ? 'place' : ''} ${s.done ? 'done' : ''}">
      <span class="tl-time">${esc(s.time || '')}</span>
      <span class="tl-dot"><i>${n || (p ? svg('c-etc') : '')}</i></span>
      <button type="button" class="tl-card" data-schedule="${s.id}">
        <b>${esc(s.title)}</b>
        ${p ? `<small class="tl-place" data-place="${p.id}">${svg(PLACE_CATS[p.category]?.svg || 'c-etc')}${esc(p.name)} · ${esc(districtName(p.district))}</small>` : ''}
        ${s.memo ? `<small class="pre">${esc(s.memo)}</small>` : ''}
      </button>
      <button type="button" class="tl-check" data-done="${s.id}" aria-label="완료"><span>${s.done ? svg('i-ok') : ''}</span></button>
    </li>`;
  }
  if (it.kind === 'transport') {
    const t = it.ref;
    const ty = TRANSPORT_TYPES[t.type] || TRANSPORT_TYPES.etc;
    return `<li class="tl-item transport">
      <span class="tl-time">${esc(t.depart || '')}</span>
      <span class="tl-dot"><i>${svg(t.type === 'flight' ? 'c-plane' : 'i-car')}</i></span>
      <button type="button" class="tl-card" data-transport="${t.id}">
        <b>${esc(t.from)} → ${esc(t.to)}</b>
        <small>${esc(ty.label)}${t.arrive ? ` · ${esc(t.depart || '')}–${esc(t.arrive)}` : ''}${t.ref ? ` · ${esc(t.ref)}` : ''}</small>
        ${t.memo ? `<small>${esc(t.memo)}</small>` : ''}
      </button>
    </li>`;
  }
  const st = it.ref;
  return `<li class="tl-item stay">
    <span class="tl-time"></span>
    <span class="tl-dot"><i>${svg('c-bed')}</i></span>
    <button type="button" class="tl-card" data-stay="${st.id}">
      <b>${it.kind === 'checkin' ? '체크인' : '체크아웃'} · ${esc(st.name)}</b>
      <small>${esc(districtName(st.district))}</small>
    </button>
  </li>`;
}

/** 여행 중이면 "다음 일정" */
function nextCard() {
  const today = shanghaiToday();
  if (!days().includes(today)) return '';
  const now = shanghaiNowHM();
  const next = itemsOf(today).find((it) => it.time && it.time >= now && !(it.kind === 'schedule' && it.ref.done));
  if (!next) return '';
  const title = next.kind === 'transport' ? `${next.ref.from} → ${next.ref.to}` : next.ref.title || next.ref.name;
  return `<div class="next card"><div><span class="eyebrow">NEXT · 현지 ${esc(now)}</span><b>${esc(next.time)} ${esc(title)}</b></div></div>`;
}

export function renderSchedule(el) {
  const ds = days();
  if (!selDay || !ds.includes(selDay)) {
    const today = shanghaiToday();
    selDay = ds.includes(today) ? today : ds[0];
  }
  const items = itemsOf(selDay);
  const { places: stops, stops: allStops } = dayStops(selDay);
  const numOf = new Map(stops.map((s) => [s.sch.id, s.n]));
  const km = legsOf(allStops).reduce((s, l) => s + l.km, 0);
  const dd = dday(S.trip.startDate, S.trip.endDate);

  el.innerHTML = `
    <header class="page-head">
      <div>
        <h1>일정</h1>
        <span class="meta">${fmtDate(ds[0])} – ${fmtDate(ds.at(-1))} · ${ds.length - 1}박 ${ds.length}일${dd ? ` · ${esc(dd)}` : ''}</span>
      </div>
      <button type="button" class="btn primary" id="addSch">${svg('i-plus')}일정</button>
    </header>
    ${nextCard()}
    <div class="day-tabs">
      ${ds.map((d, i) => `<button type="button" class="${d === selDay ? 'on' : ''}" data-day="${d}"><small>DAY ${i + 1}</small>${fmtDate(d)}</button>`).join('')}
    </div>
    <ul class="timeline">
      ${items.length ? items.map((it) => row(it, numOf)).join('') : `<li>${empty('', '이 날 일정이 없어요.')}</li>`}
    </ul>
    <button type="button" class="route-cta" data-route>
      <span><b>지도에서 동선 보기</b><small>${stops.length ? `장소 ${stops.length}곳 · 약 ${km.toFixed(1)}km` : '일정에 장소를 연결하면 동선이 그려져요'}</small></span>
      ${svg('i-route')}
    </button>`;

  el.querySelector('#addSch').onclick = () => scheduleForm(null, selDay);
  el.onclick = (e) => {
    const pl = e.target.closest('[data-place]');
    if (pl) return focusOnMap('place', pl.dataset.place, selDay);
    const t = e.target.closest('button');
    if (!t) return;
    const d = t.dataset;
    if (d.day) { selDay = d.day; renderSchedule(el); }
    else if (d.schedule) scheduleForm(byId('schedule', d.schedule));
    else if (d.done) { const s = byId('schedule', d.done); update('schedule', s.id, { done: !s.done }); }
    else if (d.transport) transportForm(byId('transports', d.transport));
    else if (d.stay) stayForm(byId('stays', d.stay));
    else if ('route' in d) showDayOnMap(selDay);
  };
}

function scheduleForm(s, date) {
  const ds = days();
  const sorted = [...S.data.places].sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
  const placeOpts = { '': '연결 안 함', ...Object.fromEntries(sorted.map((p) => [p.id, `[${PLACE_CATS[p.category]?.label || '기타'}] ${p.name}`])) };
  formModal({
    title: s ? '일정 수정' : '일정 추가',
    canDelete: !!s,
    fields: `
      ${field('제목 *', input('title', s?.title, 'required placeholder="예) 와이탄 야경 보기" autocomplete="off"'))}
      <div class="grid2">
        ${field('날짜', select('date', Object.fromEntries(ds.map((d) => [d, fmtDate(d)])), s?.date || date))}
        ${field('시간', input('time', s?.time, 'type="time"'))}
      </div>
      ${field('장소 연결', select('placeId', placeOpts, s?.placeId || ''), '장소를 연결하면 지도에 시간 순서대로 동선(화살표)이 그려져요.')}
      ${field('메모', textarea('memo', s?.memo))}`,
    onSubmit: async (v) => {
      if (!v.title) { toast('제목을 입력하세요.'); return false; }
      if (s) await update('schedule', s.id, v);
      else await add('schedule', { ...v, done: false });
      selDay = v.date;
    },
    onDelete: () => remove('schedule', s.id),
  });
}

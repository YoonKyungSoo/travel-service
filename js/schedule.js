// 일정: 날짜별 타임라인 (직접 넣은 일정 + 교통편 + 숙소 체크인/아웃 + 그날 가볼 장소)
import { S, add, update, remove, byId } from './state.js';
import { PLACE_CATS, TRANSPORT_TYPES, districtName } from './data.js';
import { esc, fmtDate, dateRange, shanghaiToday, shanghaiNowHM, byTime, toast, dday } from './util.js';
import { formModal, field, input, textarea, select, empty } from './ui.js';
import { focusOnMap } from './map.js';
import { transportForm, stayForm } from './stay.js';

let selDay = null;

function days() {
  return dateRange(S.trip.startDate, S.trip.endDate);
}

/** 그날의 타임라인 항목 (시간순) */
function itemsOf(date) {
  const out = [];
  for (const s of S.data.schedule) if (s.date === date) out.push({ kind: 'schedule', time: s.time, date, ref: s });
  for (const t of S.data.transports) if (t.date === date) out.push({ kind: 'transport', time: t.depart, date, ref: t });
  for (const st of S.data.stays) {
    if (st.status !== 'confirmed') continue;
    if (st.checkIn === date) out.push({ kind: 'checkin', time: '', date, ref: st });
    if (st.checkOut === date) out.push({ kind: 'checkout', time: '', date, ref: st });
  }
  return out.sort((a, b) => byTime(a, b));
}

function row(it) {
  if (it.kind === 'schedule') {
    const s = it.ref;
    const p = s.placeId ? byId('places', s.placeId) : null;
    return `<li class="tl-item ${s.done ? 'done' : ''}">
      <span class="tl-time">${esc(s.time || '—')}</span>
      <button type="button" class="tl-card" data-schedule="${s.id}">
        <b>${esc(s.title)}</b>
        ${p ? `<small>📍 ${esc(p.name)} · ${esc(districtName(p.district))}</small>` : ''}
        ${s.memo ? `<small class="pre">${esc(s.memo)}</small>` : ''}
      </button>
      <button type="button" class="tl-check" data-done="${s.id}" aria-label="완료">${s.done ? '✅' : '⬜'}</button>
    </li>`;
  }
  if (it.kind === 'transport') {
    const t = it.ref;
    const ty = TRANSPORT_TYPES[t.type] || TRANSPORT_TYPES.etc;
    return `<li class="tl-item transport">
      <span class="tl-time">${esc(t.depart || '—')}</span>
      <button type="button" class="tl-card" data-transport="${t.id}">
        <b>${ty.icon} ${esc(t.from)} → ${esc(t.to)}</b>
        <small>${esc(ty.label)}${t.arrive ? ` · ${esc(t.depart || '')}–${esc(t.arrive)}` : ''}${t.ref ? ` · ${esc(t.ref)}` : ''}</small>
        ${t.memo ? `<small>${esc(t.memo)}</small>` : ''}
      </button>
    </li>`;
  }
  const st = it.ref;
  return `<li class="tl-item stay">
    <span class="tl-time">🏨</span>
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
  return `<div class="next card"><small>다음 일정 (현지 ${esc(now)})</small><b>${esc(next.time)} · ${esc(title)}</b></div>`;
}

export function renderSchedule(el) {
  const ds = days();
  if (!selDay || !ds.includes(selDay)) {
    const today = shanghaiToday();
    selDay = ds.includes(today) ? today : ds[0];
  }
  const items = itemsOf(selDay);
  const places = S.data.places.filter((p) => p.date === selDay);

  const dd = dday(S.trip.startDate, S.trip.endDate);
  const nights = ds.length - 1;
  el.innerHTML = `
    <section class="hero-card">
      <div>
        <span class="eyebrow">SHANGHAI TRIP</span>
        <h1 class="hero-dday">${esc(dd || '여행 끝 🫶')}</h1>
        <p>${fmtDate(ds[0])} → ${fmtDate(ds.at(-1))} · ${nights}박 ${ds.length}일</p>
      </div>
      <div class="hero-emoji" aria-hidden="true">🥟</div>
    </section>
    <header class="page-head">
      <h1>일정</h1>
      <button type="button" class="btn primary" id="addSch"><svg class="i"><use href="#i-plus"/></svg>일정</button>
    </header>
    ${nextCard()}
    <div class="day-tabs">
      ${ds.map((d, i) => `<button type="button" class="${d === selDay ? 'on' : ''}" data-day="${d}"><small>DAY ${i + 1}</small>${fmtDate(d)}</button>`).join('')}
    </div>
    <ul class="timeline">
      ${items.length ? items.map(row).join('') : `<li>${empty('🗓️', '이 날 일정이 없어요.')}</li>`}
    </ul>
    <section class="card">
      <h3>📍 이 날 가볼 곳 <small class="muted">(장소의 방문 예정일)</small></h3>
      ${places.length ? `<ul class="list compact">${places.map((p) => `
        <li><button type="button" class="row" data-place="${p.id}">
          <span class="row-ico">${PLACE_CATS[p.category]?.icon || '📌'}</span>
          <span class="row-main"><b>${esc(p.name)}</b><small>${esc(districtName(p.district))}${p.visited ? ' · ✅' : ''}</small></span>
          <span class="row-go">지도 ›</span>
        </button></li>`).join('')}</ul>` : '<p class="muted">지도에서 장소를 추가할 때 방문 예정일을 고르면 여기에 나와요.</p>'}
    </section>`;

  el.querySelector('#addSch').onclick = () => scheduleForm(null, selDay);
  el.onclick = (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.day) { selDay = t.dataset.day; renderSchedule(el); }
    else if (t.dataset.schedule) scheduleForm(byId('schedule', t.dataset.schedule));
    else if (t.dataset.done) { const s = byId('schedule', t.dataset.done); update('schedule', s.id, { done: !s.done }); }
    else if (t.dataset.transport) transportForm(byId('transports', t.dataset.transport));
    else if (t.dataset.stay) stayForm(byId('stays', t.dataset.stay));
    else if (t.dataset.place) focusOnMap('place', t.dataset.place);
  };
}

function scheduleForm(s, date) {
  const ds = days();
  const placeOpts = { '': '연결 안 함', ...Object.fromEntries(S.data.places.map((p) => [p.id, `${PLACE_CATS[p.category]?.icon || ''} ${p.name}`])) };
  formModal({
    title: s ? '일정 수정' : '일정 추가',
    canDelete: !!s,
    fields: `
      ${field('제목 *', input('title', s?.title, 'required placeholder="예) 와이탄 야경 보기" autocomplete="off"'))}
      <div class="grid2">
        ${field('날짜', select('date', Object.fromEntries(ds.map((d) => [d, fmtDate(d)])), s?.date || date))}
        ${field('시간', input('time', s?.time, 'type="time"'))}
      </div>
      ${field('장소 연결', select('placeId', placeOpts, s?.placeId || ''))}
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

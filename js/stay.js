// 숙소(후보 비교 → 확정) · 교통편
import { S, add, update, remove, byId } from './state.js';
import { STAY_STATUS, districtName } from './data.js';
import { dest, airportFor, money, navLinksHtml, L10N, currencyOptions, transportTypes, transportTips } from './dest.js';
import { esc, fmtDate, dateRange, minusMinutes, won, toKRW, byTime, toast } from './util.js';
import { formModal, field, input, textarea, select, segmented, showDriver, empty } from './ui.js';
import { locationFieldHtml, bindLocationField, takeLocation, districtOptions, focusOnMap, fillFromCoords } from './map.js';

let seg = 'stay'; // 'stay' | 'transport'

// 귀국편 기준 공항 도착 목표 (출발 2시간 전)
function returnFlight() {
  return [...S.data.transports].filter((t) => t.type === 'flight').sort(byTime).at(-1);
}
function outboundFlight() {
  return [...S.data.transports].filter((t) => t.type === 'flight').sort(byTime)[0];
}
const outAirport = () => airportFor(outboundFlight()?.to);
const retAirport = () => airportFor(returnFlight()?.from);

export function renderStay(el) {
  el.innerHTML = `
    <header class="page-head">
      <h1>숙소 · 교통</h1>
      <button type="button" class="btn primary" id="addBtn"><svg class="i"><use href="#i-plus"/></svg>${seg === 'stay' ? '숙소 후보' : '교통편'}</button>
    </header>
    <div class="seg-tabs">
      <button type="button" class="${seg === 'stay' ? 'on' : ''}" data-seg="stay">숙소 <small>${S.data.stays.filter((s) => s.status !== 'dropped').length}</small></button>
      <button type="button" class="${seg === 'transport' ? 'on' : ''}" data-seg="transport">교통 <small>${S.data.transports.length}</small></button>
    </div>
    ${seg === 'stay' ? stayList() : transportList()}`;

  el.querySelector('#addBtn').onclick = () => (seg === 'stay' ? stayForm() : transportForm());
  el.onclick = (e) => {
    const t = e.target.closest('button, a');
    if (!t) return;
    const d = t.dataset;
    if (d.seg) { seg = d.seg; renderStay(el); }
    else if (d.editStay) stayForm(byId('stays', d.editStay));
    else if (d.confirm) confirmStay(d.confirm);
    else if (d.status) update('stays', d.id, { status: d.status });
    else if (d.driver) { const s = byId('stays', d.driver); showDriver(s.nameZh || s.name, s.addressZh, dest().country.driverAsk); }
    else if (d.onmap) focusOnMap('stay', d.onmap);
    else if (d.transport) transportForm(byId('transports', d.transport));
    else if (d.addAirport) addAirportTransport(d.addAirport);
  };
}

// ───────── 숙소 ─────────
function stayList() {
  const order = { confirmed: 0, candidate: 1, dropped: 2 };
  const list = [...S.data.stays].sort((a, b) => order[a.status] - order[b.status] || (a.createdAt || 0) - (b.createdAt || 0));
  if (!list.length) {
    return empty('🏨', '아직 숙소가 없어요. 후보를 여러 개 넣고 비교한 뒤 확정하세요.');
  }
  const confirmed = list.find((s) => s.status === 'confirmed');
  return `${confirmed ? '' : '<p class="notice">후보를 비교한 뒤 확정하면 일정에 체크인·체크아웃이 들어가고, 공항 이동 계획이 나와요.</p>'}
    <div class="cards">${list.map(stayCard).join('')}</div>`;
}


function stayCard(s) {
  const st = STAY_STATUS[s.status];
  const nights = Math.max(0, dateRange(s.checkIn, s.checkOut).length - 1);
  const krw = s.price ? toKRW(s.price, s.currency, S.trip.fxRate) : 0;
  return `<article class="card stay-card ${s.status}">
    <div class="card-top">
      <span class="tag ${st.cls}">${st.label}</span>
      <button type="button" class="icon-btn" data-edit-stay="${s.id}" aria-label="수정"><svg class="i"><use href="#i-edit"/></svg></button>
    </div>
    <h3>${esc(s.name)}</h3>
    ${s.nameZh ? `<p class="zh">${esc(s.nameZh)}</p>` : ''}
    <p class="muted">${esc(districtName(s.district))}${s.nearestMetro ? ` · ${esc(s.nearestMetro)}` : ''} · ${fmtDate(s.checkIn)} – ${fmtDate(s.checkOut)} · ${nights}박</p>
    <dl class="metrics">
      <div><dt>1박</dt><dd>${s.price ? `${won(nights ? krw / nights : krw)}<small>총 ${s.currency !== 'KRW' ? money(s.price) : won(krw)}</small>` : '—<small>가격 미입력</small>'}</dd></div>
    </dl>
    ${s.pros ? `<p class="pros">+ ${esc(s.pros)}</p>` : ''}
    ${s.cons ? `<p class="cons">− ${esc(s.cons)}</p>` : ''}
    ${s.memo ? `<p class="muted pre">${esc(s.memo)}</p>` : ''}
    ${s.bookingRef ? `<p class="muted">예약번호 ${esc(s.bookingRef)}</p>` : ''}
    <div class="btn-row">
      ${s.status !== 'confirmed' ? `<button type="button" class="btn primary" data-confirm="${s.id}">확정</button>` : `<button type="button" class="btn" data-status="candidate" data-id="${s.id}">확정 취소</button>`}
      ${s.status === 'candidate' ? `<button type="button" class="btn ghost" data-status="dropped" data-id="${s.id}">탈락</button>` : ''}
      ${s.status === 'dropped' ? `<button type="button" class="btn ghost" data-status="candidate" data-id="${s.id}">후보로 복귀</button>` : ''}
      ${typeof s.lat === 'number' ? `<button type="button" class="btn" data-onmap="${s.id}">지도</button>` : ''}
      ${s.nameZh || s.addressZh ? `<button type="button" class="btn" data-driver="${s.id}">기사님께</button>` : ''}
      ${s.bookingUrl ? `<a class="btn" href="${esc(s.bookingUrl)}" target="_blank" rel="noopener">예약</a>` : ''}
    </div>
    ${s.status === 'confirmed' ? airportPlan(s) : ''}
  </article>`;
}

/** 확정 숙소 기준 공항 이동 계획 */
/** 확정 숙소 기준 공항 이동 계획 (이동 시간은 추정하지 않고 길찾기 앱으로 확인) */
function airportPlan(s) {
  const ra = retAirport(), oa = outAirport();
  const rf = returnFlight();
  if (!ra && !oa) return '';
  const lines = [];
  const hasTo = S.data.transports.some((t) => t.date === s.checkIn && t.to.includes(s.name));
  const hasFrom = rf && S.data.transports.some((t) => t.date === rf.date && t.type !== 'flight' && t.from.includes(s.name));
  const nav = (a, b) => (typeof s.lat === 'number' && a && b ? navLinksHtml(a, b) : '');
  if (rf?.depart && ra) {
    lines.push(`<li><b>${fmtDate(rf.date)} 귀국</b> · ${esc(rf.depart)} 출발 → <b>${esc(ra.name)}</b>에 <b>${minusMinutes(rf.depart, 120)}</b>까지 도착 (출발 2시간 전)
      <div class="plan-acts">${nav(s, ra)}${hasFrom ? '<span class="tag tag-gray">교통편 등록됨</span>' : '<button type="button" class="btn sm lime" data-add-airport="from">교통편에 추가</button>'}</div></li>`);
  }
  if (oa) {
    lines.push(`<li><b>${fmtDate(s.checkIn)} 도착</b> · ${esc(oa.name)} → 숙소
      <div class="plan-acts">${nav(oa, s)}${hasTo ? '<span class="tag tag-gray">교통편 등록됨</span>' : '<button type="button" class="btn sm lime" data-add-airport="to">교통편에 추가</button>'}</div></li>`);
  }
  return `<details class="plan" ${hasTo && hasFrom ? '' : 'open'}>
    <summary>공항 이동 계획</summary>
    <ul>${lines.join('')}</ul>
    <p class="hint">숙소에서 몇 시에 나갈지는 길찾기로 그날 소요 시간을 보고 정하세요. 이른 아침엔 택시 예약 호출이 편해요.</p>
  </details>`;
}

function addAirportTransport(dir) {
  const s = S.data.stays.find((x) => x.status === 'confirmed');
  const ra = retAirport(), oa = outAirport();
  const rf = returnFlight();
  const outbound = outboundFlight();
  const taxi = dest().country.id === 'CN' ? 'didi' : 'taxi';
  if (dir === 'from' && rf) {
    add('transports', { type: taxi, date: rf.date, arrive: minusMinutes(rf.depart, 120), from: s.name, to: ra.name, memo: '귀국편 2시간 전 공항 도착 목표 · 출발 시간은 길찾기로 확인' });
  } else {
    add('transports', { type: taxi, date: s.checkIn, depart: outbound?.arrive ? minusMinutes(outbound.arrive, -60) : undefined, from: oa.name, to: s.name, memo: '입국심사·수하물 약 1시간 후' });
  }
  toast('교통편에 추가했어요.');
}

async function confirmStay(id) {
  const s = byId('stays', id);
  // 같은 기간에 이미 확정된 숙소가 있으면 후보로 내림 (기간이 겹치지 않으면 둘 다 확정 가능)
  for (const o of S.data.stays) {
    if (o.id !== id && o.status === 'confirmed' && o.checkIn < s.checkOut && s.checkIn < o.checkOut) {
      await update('stays', o.id, { status: 'candidate' });
    }
  }
  await update('stays', id, { status: 'confirmed' });
  // 숙박비 지출 자동 추가 (가격이 있고 아직 연결된 지출이 없을 때)
  if (s.price && !S.data.expenses.some((e) => e.stayId === id)) {
    if (confirm('숙박비를 지출 내역에 추가할까요?')) {
      await add('expenses', {
        date: s.checkIn, title: `숙박 · ${s.name}`, amount: s.price, currency: s.currency || 'KRW',
        payer: S.me || S.trip.members[0], shared: true, category: 'stay', method: 'card', stayId: id, district: s.district,
      });
    }
  }
  toast('숙소를 확정했어요.');
}

export function stayForm(s = null) {
  const days = dateRange(S.trip.startDate, S.trip.endDate);
  const dayOpts = Object.fromEntries(days.map((d) => [d, fmtDate(d)]));
  formModal({
    title: s ? '숙소 수정' : '숙소 후보 추가',
    canDelete: !!s,
    fields: `
      ${field('숙소 이름 *', input('name', s?.name, 'required placeholder="예) 와이탄 OO호텔" autocomplete="off"'))}
      ${field(L10N().nameLocal, input('nameZh', s?.nameZh, 'autocomplete="off"'), '택시 기사님께 보여줄 때 필요해요.')}
      ${field(L10N().addrLocal, input('addressZh', s?.addressZh, 'autocomplete="off"'))}
      ${locationFieldHtml(s?.lat, s?.lng, false)}
      ${field('구', select('district', districtOptions(), s?.district || ''))}
      <div class="grid2">
        ${field('체크인', select('checkIn', dayOpts, s?.checkIn || days[0]))}
        ${field('체크아웃', select('checkOut', dayOpts, s?.checkOut || days.at(-1)))}
      </div>
      <div class="grid2">
        ${field('총 금액', input('price', s?.price, 'type="number" inputmode="decimal" min="0" step="any" placeholder="0"'))}
        ${field('통화', segmented('currency', currencyOptions(), s?.currency || 'KRW'))}
      </div>
      ${field('가까운 지하철역', input('nearestMetro', s?.nearestMetro, 'placeholder="예) 2호선 OO역 도보 5분"'))}
      ${field('장점', input('pros', s?.pros))}
      ${field('단점', input('cons', s?.cons))}
      ${field('예약 링크', input('bookingUrl', s?.bookingUrl, 'type="url" placeholder="https://"'))}
      ${field('예약번호', input('bookingRef', s?.bookingRef, 'autocomplete="off"'))}
      ${field('메모', textarea('memo', s?.memo))}`,
    bind: bindLocationField,
    onSubmit: async (v) => {
      if (!v.name) { toast('이름을 입력하세요.'); return false; }
      if (v.checkOut <= v.checkIn) { toast('체크아웃은 체크인 이후여야 해요.'); return false; }
      if (!takeLocation(v, false)) return false;
      await fillFromCoords(v);
      if (s) await update('stays', s.id, v);
      else await add('stays', { ...v, status: 'candidate' });
      toast('저장했어요.');
    },
    onDelete: () => remove('stays', s.id),
  });
}

// ───────── 교통 ─────────
function transportList() {
  const list = [...S.data.transports].sort(byTime);
  if (!list.length) return empty('🚇', '교통편이 없어요.');
  const byDate = {};
  list.forEach((t) => (byDate[t.date] ||= []).push(t));
  return Object.entries(byDate).map(([date, ts]) => `
    <h3 class="sub">${fmtDate(date)}</h3>
    <ul class="list">${ts.map((t) => {
      const ty = transportTypes()[t.type] || { label: t.type, icon: '🧭' };
      return `<li><button type="button" class="row" data-transport="${t.id}">
        <span class="row-ico">${ty.icon}</span>
        <span class="row-main">
          <b>${esc(t.from)} → ${esc(t.to)}</b>
          <small>${esc(t.depart || '')}${t.arrive ? ` → ${esc(t.arrive)}` : ''} · ${esc(ty.label)}${t.ref ? ` · ${esc(t.ref)}` : ''}${t.cost ? ` · ${money(t.cost)}` : ''}</small>
          ${t.memo ? `<small>${esc(t.memo)}</small>` : ''}
        </span>
        <span class="row-go">›</span>
      </button></li>`;
    }).join('')}</ul>`).join('') + `
    <section class="card tips">
      <h3>🚄 참고</h3>
      <ul>
        ${transportTips().map((t) => `<li>${t}</li>`).join('')}
        <li>운행 시간·요금은 출발 전 다시 확인하세요.</li>
      </ul>
    </section>`;
}

export function transportForm(t = null) {
  const days = dateRange(S.trip.startDate, S.trip.endDate);
  formModal({
    title: t ? '교통편 수정' : '교통편 추가',
    canDelete: !!t,
    fields: `
      ${field('수단', segmented('type', Object.fromEntries(Object.entries(transportTypes()).map(([k, v]) => [k, `${v.icon} ${v.label}`])), t?.type || 'metro'))}
      ${field('날짜', select('date', Object.fromEntries(days.map((d) => [d, fmtDate(d)])), t?.date || days[0]))}
      <div class="grid2">
        ${field('출발지 *', input('from', t?.from, 'required autocomplete="off"'))}
        ${field('도착지 *', input('to', t?.to, 'required autocomplete="off"'))}
      </div>
      <div class="grid2">
        ${field('출발 시각', input('depart', t?.depart, 'type="time"'))}
        ${field('도착 시각', input('arrive', t?.arrive, 'type="time"'))}
      </div>
      <div class="grid2">
        ${field('편명/예약번호', input('ref', t?.ref, 'autocomplete="off"'))}
        ${field('요금(¥)', input('cost', t?.cost, 'type="number" inputmode="decimal" min="0" step="any"'))}
      </div>
      ${field('메모', textarea('memo', t?.memo))}`,
    onSubmit: async (v) => {
      if (!v.from || !v.to) { toast('출발지와 도착지를 입력하세요.'); return false; }
      if (t) await update('transports', t.id, v);
      else await add('transports', v);
      toast('저장했어요.');
    },
    onDelete: () => remove('transports', t.id),
  });
}


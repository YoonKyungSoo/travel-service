// 숙소(후보 비교 → 확정) · 교통편
import { S, add, update, remove, byId } from './state.js';
import { PVG, airportFor, STAY_STATUS, TRANSPORT_TYPES, districtName } from './data.js';
import { esc, fmtDate, dateRange, distanceKm, estimateDriveMin, minusMinutes, won, yuan, toKRW, byTime, toast } from './util.js';
import { formModal, field, input, textarea, select, segmented, showDriver, empty } from './ui.js';
import { locationFieldHtml, bindLocationField, takeLocation, districtOptions, focusOnMap } from './map.js';

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
    else if (d.driver) { const s = byId('stays', d.driver); showDriver(s.nameZh || s.name, s.addressZh); }
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
    return empty('🏨', '아직 숙소가 없어요. 후보를 여러 개 넣고 비교한 뒤 확정하세요.<br><small>12/13 08:40 출발이라 <b>푸둥 공항까지 거리</b>가 중요해요.</small>');
  }
  const confirmed = list.find((s) => s.status === 'confirmed');
  return `${confirmed ? '' : '<p class="notice">후보를 비교한 뒤 확정하면 일정에 체크인·체크아웃이 들어가고, 공항 이동 시간이 계산돼요.</p>'}
    <div class="cards">${list.map(stayCard).join('')}</div>`;
}

function stayMetrics(s, ap = PVG) {
  if (typeof s.lat !== 'number') return null;
  const km = distanceKm(s, ap);
  // 일정에 연결된 장소가 있으면 그 장소들 기준, 없으면 전체 장소 (디즈니 등 먼 곳 때문에 왜곡되지 않게 중앙값)
  const linked = new Set(S.data.schedule.map((x) => x.placeId).filter(Boolean));
  let pts = S.data.places.filter((p) => typeof p.lat === 'number' && !p.approx);
  if (pts.some((p) => linked.has(p.id))) pts = pts.filter((p) => linked.has(p.id));
  const ds = pts.map((p) => distanceKm(s, p)).sort((a, b) => a - b);
  const avg = ds.length ? ds[Math.floor(ds.length / 2)] : null;
  return { km, min: estimateDriveMin(km), avg, n: ds.length };
}

function stayCard(s) {
  const st = STAY_STATUS[s.status];
  const ap = retAirport();
  const m = stayMetrics(s, ap);
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
      <div><dt>${esc(ap.name.split(' ')[0])}까지</dt><dd>${m ? `${m.min}분<small>${m.km.toFixed(1)}km · 귀국</small>` : '—<small>위치 미입력</small>'}</dd></div>
      <div><dt>장소 평균</dt><dd>${m?.avg != null ? `${m.avg.toFixed(1)}km<small>${m.n}곳 기준</small>` : '—'}</dd></div>
      <div><dt>1박</dt><dd>${s.price ? `${won(nights ? krw / nights : krw)}<small>총 ${s.currency === 'CNY' ? yuan(s.price) : won(krw)}</small>` : '—<small>가격 미입력</small>'}</dd></div>
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
function airportPlan(s) {
  const ra = retAirport(), oa = outAirport();
  const m = stayMetrics(s, ra);
  const mi = stayMetrics(s, oa);
  const rf = returnFlight();
  if (!m) return '<p class="notice">숙소 위치를 입력하면 공항 이동 시간을 계산해 드려요.</p>';
  const lines = [];
  const hasTo = S.data.transports.some((t) => t.date === s.checkIn && t.to.includes(s.name));
  const hasFrom = rf && S.data.transports.some((t) => t.date === rf.date && t.type !== 'flight' && t.from.includes(s.name));
  if (rf?.depart) {
    const arriveBy = minusMinutes(rf.depart, 120);
    const leave = minusMinutes(arriveBy, m.min + 10);
    lines.push(`<li><b>${fmtDate(rf.date)} 귀국</b> · ${esc(rf.depart)} 출발 → 공항 <b>${arriveBy}</b> 도착 목표 → 숙소에서 <b>${leave}</b>쯤 출발 (${esc(ra.name)} · 디디 약 ${m.min}분)<br>
      ${hasFrom ? '<span class="tag tag-gray">교통편 등록됨</span>' : `<button type="button" class="btn sm lime" data-add-airport="from">교통편에 추가</button>`}</li>`);
  }
  lines.push(`<li><b>${fmtDate(s.checkIn)} 도착</b> · ${esc(oa.name)} → 숙소 (디디 약 ${mi.min}분${oa.id === 'PVG' ? ' / 자기부상열차+지하철도 가능' : ''})<br>
    ${hasTo ? '<span class="tag tag-gray">교통편 등록됨</span>' : `<button type="button" class="btn sm lime" data-add-airport="to">교통편에 추가</button>`}</li>`);
  return `<details class="plan" ${hasTo && hasFrom ? '' : 'open'}>
    <summary>공항 이동 계획</summary>
    <ul>${lines.join('')}</ul>
    <p class="hint">직선거리 기준 대략치. 새벽엔 지하철 첫차가 애매해 디디 예약 호출을 권장해요.</p>
  </details>`;
}

function addAirportTransport(dir) {
  const s = S.data.stays.find((x) => x.status === 'confirmed');
  const ra = retAirport(), oa = outAirport();
  const m = stayMetrics(s, ra);
  const mi = stayMetrics(s, oa);
  const rf = returnFlight();
  const outbound = outboundFlight();
  if (dir === 'from' && rf) {
    const leave = minusMinutes(minusMinutes(rf.depart, 120), m.min + 10);
    add('transports', { type: 'didi', date: rf.date, depart: leave, arrive: minusMinutes(rf.depart, 120), from: s.name, to: ra.name, memo: '귀국편 2시간 전 도착 목표' });
  } else {
    add('transports', { type: 'didi', date: s.checkIn, depart: outbound?.arrive ? minusMinutes(outbound.arrive, -60) : undefined, from: oa.name, to: s.name, memo: `입국심사·수하물 약 1시간 후 · 디디 약 ${mi.min}분` });
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
      ${field('중국어 이름', input('nameZh', s?.nameZh, 'autocomplete="off"'), '디디 기사님께 보여줄 때 필요해요.')}
      ${field('중국어 주소', input('addressZh', s?.addressZh, 'autocomplete="off"'))}
      ${locationFieldHtml(s?.lat, s?.lng, false)}
      ${field('구', select('district', districtOptions(), s?.district || ''))}
      <div class="grid2">
        ${field('체크인', select('checkIn', dayOpts, s?.checkIn || days[0]))}
        ${field('체크아웃', select('checkOut', dayOpts, s?.checkOut || days.at(-1)))}
      </div>
      <div class="grid2">
        ${field('총 금액', input('price', s?.price, 'type="number" inputmode="decimal" min="0" step="any" placeholder="0"'))}
        ${field('통화', segmented('currency', { KRW: '원 ₩', CNY: '위안 ¥' }, s?.currency || 'KRW'))}
      </div>
      ${field('가까운 지하철역', input('nearestMetro', s?.nearestMetro, 'placeholder="예) 2호선 난징동루역 도보 5분"'))}
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
      const ty = TRANSPORT_TYPES[t.type] || TRANSPORT_TYPES.etc;
      return `<li><button type="button" class="row" data-transport="${t.id}">
        <span class="row-ico">${ty.icon}</span>
        <span class="row-main">
          <b>${esc(t.from)} → ${esc(t.to)}</b>
          <small>${esc(t.depart || '')}${t.arrive ? ` → ${esc(t.arrive)}` : ''} · ${esc(ty.label)}${t.ref ? ` · ${esc(t.ref)}` : ''}${t.cost ? ` · ${yuan(t.cost)}` : ''}</small>
          ${t.memo ? `<small>${esc(t.memo)}</small>` : ''}
        </span>
        <span class="row-go">›</span>
      </button></li>`;
    }).join('')}</ul>`).join('') + `
    <section class="card tips">
      <h3>🚄 참고</h3>
      <ul>
        <li>푸둥공항 ↔ 시내: <b>자기부상열차</b>(룽양루역, 약 8분) + 지하철 2·7·16호선 환승, 또는 지하철 2호선 직통, 또는 디디</li>
        <li>지하철·버스는 <b>알리페이 교통카드(乘车码)</b> QR로 탑승 가능</li>
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
      ${field('수단', segmented('type', Object.fromEntries(Object.entries(TRANSPORT_TYPES).map(([k, v]) => [k, `${v.icon} ${v.label}`])), t?.type || 'metro'))}
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


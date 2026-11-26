// 내보내기: 일정표 PDF · 지출 내역서 PDF · 지출 CSV(엑셀)
// PDF는 브라우저 인쇄 → "PDF로 저장" 사용 (한글 깨짐 없음, 폰에서도 공유 → PDF 저장)
import { S, byId } from './state.js';
import { PLACE_CATS, EXPENSE_CATS } from './data.js';
import { esc, fmtDate, dateRange, won, toKRW, toast } from './util.js';
import { openModal, closeModal } from './ui.js';
import { dest, money, transportTypes, ALL_PAY } from './dest.js';
import { itemsOf } from './schedule.js';
import { settle, splitOf } from './expense.js';

export function exportMenu(kind) {
  openModal('내보내기', `
    <div class="export-list">
      <button type="button" class="btn big ${kind === 'schedule' ? 'primary' : ''}" data-x="schedule">일정표 PDF<small>날짜별 일정 · 장소 주소 · 교통편 · 숙소</small></button>
      <button type="button" class="btn big ${kind === 'expense' ? 'primary' : ''}" data-x="expense">지출 내역서 PDF<small>내역 · 분류별 · 사람별 부담 · 정산</small></button>
      <button type="button" class="btn big" data-x="both">일정표 + 지출 내역서 한 번에<small>PDF 한 파일 · 일정표 다음 페이지부터 지출 내역서</small></button>
      <button type="button" class="btn big" data-x="csv">지출 엑셀 (CSV)<small>엑셀·구글 시트에서 열기</small></button>
    </div>
    <p class="hint">PDF: 인쇄 창이 뜨면 대상을 <b>PDF로 저장</b>으로 고르세요. 아이폰은 인쇄 옵션 화면에서 공유 → 파일에 저장.</p>`, (el) => {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-x]');
      if (!b) return;
      closeModal();
      const x = b.dataset.x;
      if (x === 'csv') return downloadCsv();
      const html = x === 'schedule' ? scheduleDoc() : x === 'expense' ? expenseDoc() : `${scheduleDoc()}<div class="pr-break"></div>${expenseDoc()}`;
      setTimeout(() => printHtml(html), 150);
    });
  });
}

function printHtml(html) {
  let box = document.getElementById('printArea');
  if (!box) {
    box = document.createElement('div');
    box.id = 'printArea';
    document.body.appendChild(box);
  }
  box.innerHTML = html;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); box.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(() => { if (!matchMedia('print').matches) done(); }, 1500); // afterprint가 안 오는 브라우저 대비
}

const head = (title) => {
  const t = S.trip, d = dest();
  return `<header class="pr-head">
    <p class="pr-kicker">${esc(title)}</p>
    <h1>${esc(t.name)}</h1>
    <p>${esc(d.country.ko)} ${esc(d.title)} · ${fmtDate(t.startDate)} – ${fmtDate(t.endDate)} · ${esc((t.members || []).join(', '))}</p>
  </header>`;
};

// ───────── 일정표 ─────────
function scheduleDoc() {
  const t = S.trip;
  const TT = transportTypes();
  const days = dateRange(t.startDate, t.endDate);
  const dayBlock = (date, i) => {
    const items = itemsOf(date);
    const rows = items.map((it) => {
      if (it.kind === 'schedule') {
        const s = it.ref;
        const p = s.placeId ? byId('places', s.placeId) : null;
        return `<tr>
          <td class="pr-time">${esc(s.time || '')}</td>
          <td><b>${esc(s.title)}</b>
            ${p ? `<div class="pr-sub">${esc(PLACE_CATS[p.category]?.label || '')} · ${esc(p.name)}${p.nameZh ? ` <span class="pr-local">${esc(p.nameZh)}</span>` : ''}</div>` : ''}
            ${p?.addressZh ? `<div class="pr-addr">${esc(p.addressZh)}</div>` : ''}
            ${p?.howto ? `<div class="pr-sub">가는 법: ${esc(p.howto)}</div>` : ''}
            ${s.memo ? `<div class="pr-memo">${esc(s.memo)}</div>` : ''}
            ${p?.memo ? `<div class="pr-memo">${esc(p.memo)}</div>` : ''}
          </td></tr>`;
      }
      if (it.kind === 'transport') {
        const x = it.ref;
        return `<tr class="pr-tr">
          <td class="pr-time">${esc(x.depart || '')}</td>
          <td><b>${esc((TT[x.type] || { label: x.type }).label)} · ${esc(x.from)} → ${esc(x.to)}</b>
            <div class="pr-sub">${x.depart ? esc(x.depart) : ''}${x.arrive ? ` – ${esc(x.arrive)}` : ''}${x.ref ? ` · ${esc(x.ref)}` : ''}</div>
            ${x.memo ? `<div class="pr-memo">${esc(x.memo)}</div>` : ''}
          </td></tr>`;
      }
      const st = it.ref;
      return `<tr class="pr-stay"><td class="pr-time"></td><td><b>${it.kind === 'checkin' ? '체크인' : '체크아웃'} · ${esc(st.name)}</b>
        ${st.nameZh ? `<span class="pr-local">${esc(st.nameZh)}</span>` : ''}
        ${st.addressZh ? `<div class="pr-addr">${esc(st.addressZh)}</div>` : ''}
        ${st.bookingRef ? `<div class="pr-sub">예약번호 ${esc(st.bookingRef)}</div>` : ''}</td></tr>`;
    }).join('');
    // 그날 밤 숙소
    const night = S.data.stays.find((s) => s.status === 'confirmed' && s.checkIn <= date && date < s.checkOut);
    return `<section class="pr-day">
      <h2><span>DAY ${i + 1}</span> ${fmtDate(date)}</h2>
      ${rows ? `<table class="pr-table">${rows}</table>` : '<p class="pr-empty">일정 없음</p>'}
      ${night ? `<p class="pr-night">숙소: ${esc(night.name)}${night.addressZh ? ` · ${esc(night.addressZh)}` : ''}</p>` : ''}
    </section>`;
  };
  return `<div class="pr-doc">${head('일정표')}${days.map(dayBlock).join('')}</div>`;
}

// ───────── 지출 내역서 ─────────
function expenseRows() {
  const t = S.trip, fx = t.fxRate, members = t.members || [];
  return [...S.data.expenses].sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0)).map((e) => {
    const parts = splitOf(e, members);
    return {
      e, krw: toKRW(e.amount, e.currency, fx),
      split: e.shared ? (parts.length === members.length ? `${parts.length}명 같이` : parts.join('·')) : '개인',
      cat: EXPENSE_CATS[e.category]?.label || '기타',
      method: ALL_PAY[e.method] || '',
    };
  });
}

function expenseDoc() {
  const t = S.trip, fx = t.fxRate, members = t.members || [];
  const cur = dest().country.currency;
  const rows = expenseRows();
  const total = rows.reduce((s, r) => s + r.krw, 0);
  const burden = Object.fromEntries(members.map((m) => [m, 0]));
  const paid = Object.fromEntries(members.map((m) => [m, 0]));
  for (const r of rows) {
    const parts = splitOf(r.e, members);
    parts.forEach((m) => { if (m in burden) burden[m] += r.krw / parts.length; });
    if (r.e.payer in paid) paid[r.e.payer] += r.krw;
  }
  const byCat = Object.entries(EXPENSE_CATS).map(([k, c]) => [c.label, rows.filter((r) => r.e.category === k).reduce((s, r) => s + r.krw, 0)]).filter(([, v]) => v > 0);
  const moves = settle();
  return `<div class="pr-doc">${head('지출 내역서')}
    <section class="pr-sum">
      <div><small>총 지출</small><b>${won(total)}</b></div>
      <div><small>환율</small><b>${cur.sym}${cur.unit} = ${won(fx * cur.unit)}</b></div>
      <div><small>건수</small><b>${rows.length}건</b></div>
    </section>
    <h2>사람별</h2>
    <table class="pr-table pr-grid"><tr><th>이름</th><th>실제 결제</th><th>부담해야 할 몫</th></tr>
      ${members.map((m) => `<tr><td>${esc(m)}</td><td class="num">${won(paid[m])}</td><td class="num">${won(burden[m])}</td></tr>`).join('')}
    </table>
    <h2>정산</h2>
    ${moves.length ? `<ul class="pr-moves">${moves.map((mv) => `<li><b>${esc(mv.from)}</b> → <b>${esc(mv.to)}</b> ${won(mv.amt)}</li>`).join('')}</ul>` : '<p class="pr-empty">정산할 금액이 없어요.</p>'}
    <h2>분류별</h2>
    <table class="pr-table pr-grid">${byCat.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${won(v)}</td></tr>`).join('') || '<tr><td>—</td></tr>'}</table>
    <h2>내역</h2>
    <table class="pr-table pr-grid pr-small">
      <tr><th>날짜</th><th>내용</th><th>분류</th><th>결제</th><th>나눔</th><th class="num">금액</th><th class="num">원화</th></tr>
      ${rows.map((r) => `<tr>
        <td>${fmtDate(r.e.date)}</td>
        <td>${esc(r.e.title)}${r.e.memo ? `<div class="pr-memo">${esc(r.e.memo)}</div>` : ''}</td>
        <td>${esc(r.cat)}</td>
        <td>${esc(r.e.payer)}${r.method ? ` · ${esc(r.method)}` : ''}</td>
        <td>${esc(r.split)}</td>
        <td class="num">${r.e.currency === 'KRW' ? '' : esc(money(r.e.amount))}</td>
        <td class="num">${won(r.krw)}</td>
      </tr>`).join('')}
    </table>
  </div>`;
}

// ───────── CSV ─────────
function downloadCsv() {
  const rows = expenseRows();
  if (!rows.length) return toast('지출 내역이 없어요.');
  const cur = dest().country.currency;
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    ['날짜', '내용', '분류', '결제한 사람', '결제 수단', '나눔', '통화', '금액', '원화 환산', '메모'],
    ...rows.map((r) => [r.e.date, r.e.title, r.cat, r.e.payer, r.method, r.split, r.e.currency === 'KRW' ? 'KRW' : cur.code, r.e.amount, Math.round(r.krw), r.e.memo || '']),
  ].map((l) => l.map(q).join(','));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }); // BOM: 엑셀 한글 깨짐 방지
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${S.trip.name}_지출.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

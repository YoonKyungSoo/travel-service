// 지출 내역 · 합계 · 정산
import { S, add, update, remove, byId } from './state.js';
import { EXPENSE_CATS, districtName } from './data.js';
import { esc, fmtDate, dateRange, won, toKRW, toast } from './util.js';
import { dest, money, currencyOptions, payMethods, ALL_PAY, quickExpenses, localToday } from './dest.js';
import { formModal, field, input, textarea, select, segmented, empty, openModal, closeModal } from './ui.js';
import { districtOptions } from './map.js';

let catFilter = 'all';

/** 이 지출을 나눠 내는 사람들. 개인 지출은 결제한 사람만, 예전 "같이" 기록(split 없음)은 멤버 전원 */
export function splitOf(e, members = S.trip.members || []) {
  if (!e.shared) return [e.payer];
  const picked = (e.split || []).filter((m) => members.includes(m));
  return picked.length ? picked : members;
}

/** 정산: 지출마다 나눌 사람끼리 1/N, 더 낸 사람이 받을 금액 계산 (인원 제한 없음) */
export function settle() {
  const members = S.trip.members || [];
  const fx = S.trip.fxRate;
  const bal = Object.fromEntries(members.map((m) => [m, 0]));
  for (const e of S.data.expenses) {
    if (!e.shared || !members.length) continue;
    const krw = toKRW(e.amount, e.currency, fx);
    const parts = splitOf(e, members);
    if (e.payer in bal) bal[e.payer] += krw;
    parts.forEach((m) => { if (m in bal) bal[m] -= krw / parts.length; });
  }
  // 많이 낸 사람 ← 적게 낸 사람 (탐욕적 매칭)
  const pos = Object.entries(bal).filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1]);
  const neg = Object.entries(bal).filter(([, v]) => v < -1).sort((a, b) => a[1] - b[1]);
  const moves = [];
  let i = 0, j = 0;
  while (i < pos.length && j < neg.length) {
    const amt = Math.min(pos[i][1], -neg[j][1]);
    moves.push({ from: neg[j][0], to: pos[i][0], amt });
    pos[i][1] -= amt; neg[j][1] += amt;
    if (pos[i][1] < 1) i++;
    if (neg[j][1] > -1) j++;
  }
  return moves;
}

function splitLabel(e, members) {
  if (!e.shared) return '개인';
  const parts = splitOf(e, members);
  return parts.length === members.length ? `${parts.length}명 같이` : `${parts.join('·')} 나눔`;
}

export function renderExpense(el) {
  const fx = S.trip.fxRate;
  const members = S.trip.members || [];
  const all = S.data.expenses;
  const totalKRW = all.reduce((s, e) => s + toKRW(e.amount, e.currency, fx), 0);
  const cur = dest().country.currency;
  const totalLocal = all.filter((e) => e.currency !== 'KRW').reduce((s, e) => s + e.amount, 0);
  const totalWon = all.filter((e) => e.currency === 'KRW').reduce((s, e) => s + e.amount, 0);

  // 사람별 실제 부담액 (같이: 1/N, 개인: 본인)
  const burden = Object.fromEntries(members.map((m) => [m, 0]));
  for (const e of all) {
    const krw = toKRW(e.amount, e.currency, fx);
    const parts = splitOf(e, members);
    parts.forEach((m) => { if (m in burden) burden[m] += krw / parts.length; });
  }
  const byCat = Object.keys(EXPENSE_CATS).map((k) => [k, all.filter((e) => e.category === k).reduce((s, e) => s + toKRW(e.amount, e.currency, fx), 0)]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const maxCat = byCat[0]?.[1] || 1;
  const moves = settle();

  let list = catFilter === 'all' ? all : all.filter((e) => e.category === catFilter);
  list = [...list].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  const byDate = {};
  list.forEach((e) => (byDate[e.date] ||= []).push(e));

  el.innerHTML = `
    <header class="page-head">
      <h1>지출</h1>
      <div class="head-acts"><button type="button" class="btn ghost" id="expExport" aria-label="내보내기"><svg class="i"><use href="#i-download"/></svg><span class="lbl">내보내기</span></button><button type="button" class="btn primary" id="addExp"><svg class="i"><use href="#i-plus"/></svg>지출</button></div>
    </header>
    <section class="summary">
      <div class="total">
        <div class="total-label"><span class="eyebrow" style="margin:0">TOTAL</span><button type="button" class="fx" id="fxBtn">${cur.sym}${cur.unit} = ₩${esc(Math.round(fx * cur.unit * 100) / 100)}</button></div>
        <b class="total-num">${won(totalKRW)}</b>
        <span class="total-sub">${all.length ? [totalWon ? `원화 결제 ${won(totalWon)}` : '', totalLocal ? `${cur.ko} 결제 ${money(totalLocal)}` : ''].filter(Boolean).join(' · ') : '아직 지출이 없어요'}</span>
      </div>
      <div class="per">
        ${members.map((m) => `<div><small>${esc(m)} 부담</small><b>${won(burden[m])}</b></div>`).join('')}
      </div>
      ${members.length > 1 && moves.length ? `<div class="settle">${moves.map((mv) => `<b>${esc(mv.from)}</b> → <b>${esc(mv.to)}</b> <b class="amt">${won(mv.amt)}</b> 보내기`).join('<br>')}</div>` : ''}
      ${byCat.length ? `<ul class="bars">${byCat.map(([k, v]) => `
        <li><span>${EXPENSE_CATS[k].label}</span><i style="width:${(v / maxCat) * 100}%"></i><b>${won(v)}</b></li>`).join('')}</ul>` : ''}
    </section>
    <div class="chips scroll-x">
      <button type="button" class="chip ${catFilter === 'all' ? 'on' : ''}" data-cat="all">전체</button>
      ${Object.entries(EXPENSE_CATS).map(([k, c]) => `<button type="button" class="chip ${catFilter === k ? 'on' : ''}" data-cat="${k}">${c.label}</button>`).join('')}
    </div>
    ${list.length ? Object.entries(byDate).map(([date, es]) => `
      <h3 class="sub">${fmtDate(date)} <small>${won(es.reduce((s, e) => s + toKRW(e.amount, e.currency, fx), 0))}</small></h3>
      <ul class="list">${es.map((e) => `
        <li><button type="button" class="row" data-exp="${e.id}">
          <span class="row-ico">${EXPENSE_CATS[e.category]?.icon || '💳'}</span>
          <span class="row-main">
            <b>${esc(e.title)}</b>
            <small>${esc(e.payer)} · ${ALL_PAY[e.method] || ''} · ${splitLabel(e, members)}${e.district ? ' · ' + esc(districtName(e.district)) : ''}</small>
          </span>
          <span class="row-amt"><b>${e.currency !== 'KRW' ? money(e.amount) : won(e.amount)}</b>${e.currency !== 'KRW' ? `<small>${won(e.amount * fx)}</small>` : ''}</span>
        </button></li>`).join('')}</ul>`).join('') : empty('', '지출 내역이 없어요.')}`;

  el.querySelector('#addExp').onclick = () => expenseForm();
  el.querySelector('#fxBtn').onclick = editFx;
  el.querySelector('#expExport').onclick = () => import('./print.js').then((m) => m.exportMenu('expense'));
  el.onclick = (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.cat) { catFilter = t.dataset.cat !== 'all' && catFilter === t.dataset.cat ? 'all' : t.dataset.cat; renderExpense(el); }
    else if (t.dataset.exp) expenseForm(byId('expenses', t.dataset.exp));
  };
}

function editFx() {
  openModal('환율', `
    <form class="form" id="fxForm">
      ${field(`1 ${dest().country.currency.ko}(${dest().country.currency.sym})은 몇 원?`, input('fx', S.trip.fxRate, 'type="number" inputmode="decimal" step="any" min="1"'), '환전/카드 결제 환율에 맞춰 바꾸면 모든 원화 금액이 다시 계산돼요.')}
      <div class="form-actions"><span></span><button type="submit" class="btn primary">저장</button></div>
    </form>`, (body) => {
    body.querySelector('#fxForm').onsubmit = (e) => {
      e.preventDefault();
      const v = Number(e.target.fx.value);
      if (!(v > 0)) return toast('숫자를 입력하세요.');
      S.store.updateTrip(S.key, { fxRate: v });
      closeModal();
    };
  });
}

function expenseForm(x = null) {
  const days = dateRange(S.trip.startDate, S.trip.endDate);
  const today = localToday();
  const dayOpts = { ...Object.fromEntries(days.map((d) => [d, fmtDate(d)])), pre: '여행 전 (예약 등)' };
  const members = S.trip.members || [];
  const defDate = x?.date || (days.includes(today) ? today : days[0]);
  formModal({
    title: x ? '지출 수정' : '지출 추가',
    canDelete: !!x,
    fields: `
      <div class="amount-hero">
        ${segmented('currency', currencyOptions(), x?.currency || dest().country.currency.code)}
        <input name="amount" value="${esc(x?.amount ?? '')}" type="number" inputmode="decimal" min="0" step="any" placeholder="0" aria-label="금액" />
        <small class="krw-preview" data-krw></small>
      </div>
      ${field('뭐에 썼어요? *', input('title', x?.title, 'required placeholder="예) 저녁 식사" autocomplete="off"'))}
      ${x ? '' : `<div class="quick-chips">${quickExpenses().map((q, i) => `<button type="button" class="chip" data-quick="${i}">${q[0]}</button>`).join('')}</div>`}
      ${field('분류', segmented('category', Object.fromEntries(Object.entries(EXPENSE_CATS).map(([k, c]) => [k, `${c.icon} ${c.label}`])), x?.category || 'food'))}
      ${field('결제한 사람', segmented('payer', Object.fromEntries(members.map((m) => [m, m])), x?.payer || S.me || members[0]))}
      ${field('누구랑 나눠요?', `<div class="seg">${members.map((m) => `<label><input type="checkbox" name="_split" value="${esc(m)}" ${(x ? splitOf(x, members) : members).includes(m) ? 'checked' : ''} /><span>${esc(m)}</span></label>`).join('')}</div>`, '고른 사람끼리 1/N. 결제한 사람만 고르면 개인 지출이에요.')}
      ${field('결제 수단', segmented('method', payMethods(), x?.method || Object.keys(payMethods())[0]))}
      ${field('날짜', select('date', dayOpts, x?.date && !days.includes(x.date) ? 'pre' : defDate))}
      ${field('구', select('district', { ...districtOptions(), '': '선택 안 함' }, x?.district || ''))}
      ${field('메모', textarea('memo', x?.memo))}`,
    onSubmit: async (v, form) => {
      if (!v.title) { toast('내용을 입력하세요.'); return false; }
      if (!(v.amount > 0)) { toast('금액을 입력하세요.'); return false; }
      const split = [...form.querySelectorAll('input[name=_split]:checked')].map((i) => i.value);
      delete v._split;
      if (!split.length) { toast('나눌 사람을 한 명 이상 고르세요.'); return false; }
      v.split = split;
      v.shared = !(split.length === 1 && split[0] === v.payer);
      if (v.date === 'pre') v.date = x?.date && !days.includes(x.date) ? x.date : S.trip.startDate.replace(/\d\d$/, '01');
      if (x) await update('expenses', x.id, v);
      else await add('expenses', v);
      toast('저장했어요.');
    },
    onDelete: () => remove('expenses', x.id),
    bind: (form) => {
      const amt = form.elements.amount;
      const prev = form.querySelector('[data-krw]');
      const upd = () => {
        const cur = form.querySelector('input[name=currency]:checked')?.value;
        const n = Number(amt.value);
        prev.textContent = cur !== 'KRW' && n > 0 ? `≈ ${won(n * S.trip.fxRate)}` : '';
      };
      amt.addEventListener('input', upd);
      form.querySelectorAll('input[name=currency]').forEach((r) => r.addEventListener('change', upd));
      upd();
      if (!x) setTimeout(() => amt.focus(), 250); // 금액부터 바로 입력
      // 빠른 입력: 제목 + 분류 + 결제수단 한 번에
      form.addEventListener('click', (e) => {
        const b = e.target.closest('[data-quick]');
        if (!b) return;
        const [label, cat, method] = quickExpenses()[b.dataset.quick];
        form.elements.title.value = label.replace(/^\S+\s/, '');
        form.querySelector(`input[name=category][value=${cat}]`).checked = true;
        const m = method && form.querySelector(`input[name=method][value=${method}]`);
        if (m) m.checked = true;
        form.querySelectorAll('[data-quick]').forEach((c) => c.classList.toggle('on', c === b));
      });
    },
  });
}

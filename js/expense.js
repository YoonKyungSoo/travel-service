// 지출 내역 · 합계 · 정산
import { S, add, update, remove, byId } from './state.js';
import { EXPENSE_CATS, PAY_METHODS, districtName } from './data.js';
import { esc, fmtDate, dateRange, won, yuan, toKRW, shanghaiToday, toast } from './util.js';
import { formModal, field, input, textarea, select, segmented, empty, openModal, closeModal } from './ui.js';
import { districtOptions } from './map.js';

let catFilter = 'all';

/** 정산: 같이 쓴 돈(shared)을 멤버 수로 나눠, 더 낸 사람이 받을 금액 계산 */
function settle() {
  const members = S.trip.members || [];
  const fx = S.trip.fxRate;
  const bal = Object.fromEntries(members.map((m) => [m, 0]));
  for (const e of S.data.expenses) {
    if (!e.shared || !members.length) continue;
    const krw = toKRW(e.amount, e.currency, fx);
    if (e.payer in bal) bal[e.payer] += krw;
    members.forEach((m) => (bal[m] -= krw / members.length));
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

export function renderExpense(el) {
  const fx = S.trip.fxRate;
  const members = S.trip.members || [];
  const all = S.data.expenses;
  const totalKRW = all.reduce((s, e) => s + toKRW(e.amount, e.currency, fx), 0);
  const totalCNY = all.filter((e) => e.currency === 'CNY').reduce((s, e) => s + e.amount, 0);

  // 사람별 실제 부담액 (같이: 1/N, 개인: 본인)
  const burden = Object.fromEntries(members.map((m) => [m, 0]));
  for (const e of all) {
    const krw = toKRW(e.amount, e.currency, fx);
    if (e.shared) members.forEach((m) => (burden[m] += krw / members.length));
    else if (e.payer in burden) burden[e.payer] += krw;
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
      <button type="button" class="btn primary" id="addExp"><svg class="i"><use href="#i-plus"/></svg>지출</button>
    </header>
    <section class="summary">
      <div class="total">
        <div class="total-label"><span class="eyebrow" style="margin:0">TOTAL</span><button type="button" class="fx" id="fxBtn">1¥ = ₩${esc(fx)}</button></div>
        <b class="total-num">${won(totalKRW)}</b>
        <span class="total-sub">${totalCNY ? `위안 결제 ${yuan(totalCNY)}` : '아직 지출이 없어요'}</span>
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
            <small>${esc(e.payer)} · ${PAY_METHODS[e.method] || ''} · ${e.shared ? '같이' : '개인'}${e.district ? ' · ' + esc(districtName(e.district)) : ''}</small>
          </span>
          <span class="row-amt"><b>${e.currency === 'CNY' ? yuan(e.amount) : won(e.amount)}</b>${e.currency === 'CNY' ? `<small>${won(e.amount * fx)}</small>` : ''}</span>
        </button></li>`).join('')}</ul>`).join('') : empty('', '지출 내역이 없어요.')}`;

  el.querySelector('#addExp').onclick = () => expenseForm();
  el.querySelector('#fxBtn').onclick = editFx;
  el.onclick = (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.cat) { catFilter = t.dataset.cat; renderExpense(el); }
    else if (t.dataset.exp) expenseForm(byId('expenses', t.dataset.exp));
  };
}

function editFx() {
  openModal('환율', `
    <form class="form" id="fxForm">
      ${field('1 위안(¥)은 몇 원?', input('fx', S.trip.fxRate, 'type="number" inputmode="decimal" step="any" min="1"'), '환전/카드 결제 환율에 맞춰 바꾸면 모든 원화 금액이 다시 계산돼요.')}
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
  const today = shanghaiToday();
  const dayOpts = { ...Object.fromEntries(days.map((d) => [d, fmtDate(d)])), pre: '여행 전 (예약 등)' };
  const members = S.trip.members || [];
  const defDate = x?.date || (days.includes(today) ? today : days[0]);
  formModal({
    title: x ? '지출 수정' : '지출 추가',
    canDelete: !!x,
    fields: `
      <div class="amount-hero">
        ${segmented('currency', { CNY: '¥ 위안', KRW: '₩ 원' }, x?.currency || 'CNY')}
        <input name="amount" value="${esc(x?.amount ?? '')}" type="number" inputmode="decimal" min="0" step="any" placeholder="0" aria-label="금액" />
        <small class="krw-preview" data-krw></small>
      </div>
      ${field('뭐에 썼어요? *', input('title', x?.title, 'required placeholder="예) 샤오롱바오" autocomplete="off"'))}
      ${x ? '' : `<div class="quick-chips">${QUICK.map((q, i) => `<button type="button" class="chip" data-quick="${i}">${q[0]}</button>`).join('')}</div>`}
      ${field('분류', segmented('category', Object.fromEntries(Object.entries(EXPENSE_CATS).map(([k, c]) => [k, `${c.icon} ${c.label}`])), x?.category || 'food'))}
      ${field('결제한 사람', segmented('payer', Object.fromEntries(members.map((m) => [m, m])), x?.payer || S.me || members[0]))}
      ${field('나누기', segmented('shared', { true: '👥 같이 (1/N)', false: '👤 개인' }, String(x?.shared ?? true)))}
      ${field('결제 수단', segmented('method', PAY_METHODS, x?.method || 'alipay'))}
      ${field('날짜', select('date', dayOpts, x?.date && !days.includes(x.date) ? 'pre' : defDate))}
      ${field('구', select('district', { ...districtOptions(), '': '선택 안 함' }, x?.district || ''))}
      ${field('메모', textarea('memo', x?.memo))}`,
    onSubmit: async (v) => {
      if (!v.title) { toast('내용을 입력하세요.'); return false; }
      if (!(v.amount > 0)) { toast('금액을 입력하세요.'); return false; }
      v.shared = v.shared === 'true';
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
        prev.textContent = cur === 'CNY' && n > 0 ? `≈ ${won(n * S.trip.fxRate)}` : '';
      };
      amt.addEventListener('input', upd);
      form.querySelectorAll('input[name=currency]').forEach((r) => r.addEventListener('change', upd));
      upd();
      if (!x) setTimeout(() => amt.focus(), 250); // 금액부터 바로 입력
      // 빠른 입력: 제목 + 분류 + 결제수단 한 번에
      form.addEventListener('click', (e) => {
        const b = e.target.closest('[data-quick]');
        if (!b) return;
        const [label, cat, method] = QUICK[b.dataset.quick];
        form.elements.title.value = label.replace(/^\S+\s/, '');
        form.querySelector(`input[name=category][value=${cat}]`).checked = true;
        if (method) form.querySelector(`input[name=method][value=${method}]`).checked = true;
        form.querySelectorAll('[data-quick]').forEach((c) => c.classList.toggle('on', c === b));
      });
    },
  });
}

// 빠른 입력 버튼: [표시, 분류, 결제수단]
const QUICK = [
  ['🍜 식사', 'food', 'alipay'],
  ['☕ 커피', 'food', 'alipay'],
  ['🧋 버블티', 'food', 'alipay'],
  ['🚕 디디', 'transport', 'alipay'],
  ['🚇 지하철', 'transport', 'alipay'],
  ['🏪 편의점', 'shopping', 'alipay'],
  ['🎫 입장료', 'sight', 'alipay'],
  ['🛍️ 쇼핑', 'shopping', 'alipay'],
];

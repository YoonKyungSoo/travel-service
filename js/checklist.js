// 준비물 체크리스트
import { S, add, update, remove, byId } from './state.js';
import { CHECK_GROUPS } from './data.js';
import { esc, toast } from './util.js';
import { formModal, field, input, select, segmented, empty } from './ui.js';

let filter = 'all'; // all | todo | <멤버이름> | 공용

const assignees = () => [...(S.trip.members || []), '공용'];

export function renderChecklist(el) {
  const all = S.data.checklist;
  const done = all.filter((c) => c.checked).length;
  const pct = all.length ? Math.round((done / all.length) * 100) : 0;
  let list = all;
  if (filter === 'todo') list = list.filter((c) => !c.checked);
  else if (filter !== 'all') list = list.filter((c) => (c.assignee || '공용') === filter);

  const groups = [...CHECK_GROUPS, ...new Set(all.map((c) => c.group).filter((g) => !CHECK_GROUPS.includes(g)))];
  const filters = { all: '전체', todo: '안 챙긴 것', ...Object.fromEntries(assignees().map((a) => [a, a])) };

  el.innerHTML = `
    <header class="page-head">
      <div><h1>준비물</h1><span class="meta">${done} / ${all.length} 챙김 · ${pct}%${pct === 100 ? ' · 짐 싸기 끝' : ''}</span></div>
    </header>
    <div class="progress"><i style="width:${pct}%"></i></div>
    <form class="quick-add" id="quickAdd">
      <select name="group">${CHECK_GROUPS.map((g) => `<option>${esc(g)}</option>`).join('')}</select>
      <input name="text" placeholder="준비물 추가" autocomplete="off" enterkeyhint="done" />
      <button type="submit" class="btn primary" aria-label="추가"><svg class="i"><use href="#i-plus"/></svg></button>
    </form>
    <div class="chips scroll-x">
      ${Object.entries(filters).map(([k, l]) => `<button type="button" class="chip ${filter === k ? 'on' : ''}" data-filter="${esc(k)}">${esc(l)}</button>`).join('')}
    </div>
    ${list.length ? groups.map((g) => {
      const items = list.filter((c) => c.group === g).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt || 0) - (b.createdAt || 0));
      if (!items.length) return '';
      return `<h3 class="sub">${esc(g)} <small>${items.filter((c) => c.checked).length}/${items.length}</small></h3>
        <ul class="list checks">${items.map((c) => `
          <li class="${c.checked ? 'done' : ''}">
            <button type="button" class="check-row" data-toggle="${c.id}">
              <span class="box">${c.checked ? '<svg class="i"><use href="#i-ok"/></svg>' : ''}</span>
              <span class="row-main"><b>${esc(c.text)}</b>${c.note ? `<small>${esc(c.note)}</small>` : ''}</span>
            </button>
            <button type="button" class="who" data-assign="${c.id}" title="담당자 바꾸기">${esc(c.assignee || '공용')}</button>
            <button type="button" class="icon-btn" data-edit="${c.id}" aria-label="수정">⋯</button>
          </li>`).join('')}</ul>`;
    }).join('') : empty('', filter === 'todo' ? '다 챙겼어요.' : '준비물이 없어요.')}`;

  const qa = el.querySelector('#quickAdd');
  qa.group.value = el.dataset.lastGroup || CHECK_GROUPS[0];
  qa.onsubmit = async (e) => {
    e.preventDefault();
    const text = qa.text.value.trim();
    if (!text) return;
    el.dataset.lastGroup = qa.group.value;
    await add('checklist', { text, group: qa.group.value, assignee: '공용', checked: false, order: Date.now() });
    // 다시 그려진 뒤에도 연속 입력되게 포커스 유지
    setTimeout(() => el.querySelector('#quickAdd input[name=text]')?.focus(), 0);
  };

  el.onclick = (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const d = t.dataset;
    if (d.filter) { filter = d.filter; renderChecklist(el); }
    else if (d.toggle) { const c = byId('checklist', d.toggle); update('checklist', c.id, { checked: !c.checked }); }
    else if (d.assign) {
      const c = byId('checklist', d.assign);
      const a = assignees();
      update('checklist', c.id, { assignee: a[(a.indexOf(c.assignee || '공용') + 1) % a.length] });
    } else if (d.edit) itemForm(byId('checklist', d.edit));
  };
}

function itemForm(c) {
  formModal({
    title: '준비물 수정',
    canDelete: true,
    fields: `
      ${field('내용', input('text', c.text, 'required autocomplete="off"'))}
      ${field('메모', input('note', c.note, 'autocomplete="off"'))}
      ${field('분류', select('group', Object.fromEntries(CHECK_GROUPS.map((g) => [g, g])), c.group))}
      ${field('담당', segmented('assignee', Object.fromEntries(assignees().map((a) => [a, a])), c.assignee || '공용'))}`,
    onSubmit: async (v) => {
      if (!v.text) { toast('내용을 입력하세요.'); return false; }
      await update('checklist', c.id, v);
    },
    onDelete: () => remove('checklist', c.id),
  });
}

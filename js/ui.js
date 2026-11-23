// 모달(입력 폼) · 폼 필드 · 기사님께 보여주기
import { esc } from './util.js';

const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
let onCloseCb = null;

/**
 * 모달 열기
 * @param {string} title
 * @param {string} html  본문 HTML
 * @param {(body: HTMLElement) => void} [bind]  이벤트 연결
 */
export function openModal(title, html, bind, onClose) {
  modalTitle.textContent = title;
  modalBody.innerHTML = html;
  modal.hidden = false;
  document.body.classList.add('modal-open');
  onCloseCb = onClose || null;
  bind?.(modalBody);
  // 모바일에서 키보드가 자동으로 튀어나오지 않도록 첫 입력칸 자동 포커스는 PC에서만
  if (matchMedia('(min-width: 768px)').matches) modalBody.querySelector('input:not([type=hidden]),textarea')?.focus();
}
export function closeModal() {
  modal.hidden = true;
  modalBody.innerHTML = '';
  document.body.classList.remove('modal-open');
  const cb = onCloseCb;
  onCloseCb = null;
  cb?.();
}
modal.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.hidden) closeModal();
});

// ── 폼 필드 헬퍼 (값은 모두 이스케이프) ──
export const field = (label, inner, hint = '') =>
  `<label class="field"><span class="field-label">${label}</span>${inner}${hint ? `<small class="hint">${hint}</small>` : ''}</label>`;

export const input = (name, value = '', attrs = '') =>
  `<input name="${name}" value="${esc(value)}" ${attrs} />`;

export const textarea = (name, value = '', attrs = '') =>
  `<textarea name="${name}" rows="3" ${attrs}>${esc(value)}</textarea>`;

/** options: {value: label} */
export const select = (name, options, value) =>
  `<select name="${name}">${Object.entries(options)
    .map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value ?? '') ? 'selected' : ''}>${esc(l)}</option>`)
    .join('')}</select>`;

/** 버튼형 단일 선택 (모바일에서 select보다 누르기 쉬움) */
export const segmented = (name, options, value) =>
  `<div class="seg">${Object.entries(options)
    .map(([v, l]) => `<label><input type="radio" name="${name}" value="${esc(v)}" ${String(v) === String(value) ? 'checked' : ''} /><span>${esc(l)}</span></label>`)
    .join('')}</div>`;

export const formActions = (canDelete) =>
  `<div class="form-actions">
    ${canDelete ? '<button type="button" class="btn danger ghost" data-act="delete">삭제</button>' : '<span></span>'}
    <button type="submit" class="btn primary">저장</button>
  </div>`;

/** form → 일반 객체. number 타입 input은 숫자로 */
export function readForm(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; continue; }
    if (el.type === 'checkbox') { out[el.name] = el.checked; continue; }
    const v = el.value.trim();
    out[el.name] = el.type === 'number' || el.inputMode === 'decimal' ? (v === '' ? undefined : Number(v)) : v || undefined;
  }
  return out;
}

/** 폼 모달 한 번에 */
export function formModal({ title, fields, canDelete, onSubmit, onDelete, bind }) {
  openModal(title, `<form class="form" novalidate>${fields}${formActions(canDelete)}</form>`, (body) => {
    const form = body.querySelector('form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ok = await onSubmit(readForm(form), form);
      if (ok !== false) closeModal();
    });
    form.querySelector('[data-act=delete]')?.addEventListener('click', async () => {
      if (!confirm('삭제할까요?')) return;
      await onDelete();
      closeModal();
    });
    bind?.(form);
  });
}

// ── 기사님께 보여주기 ──
const driver = document.getElementById('driver');
export function showDriver(nameZh, addrZh) {
  document.getElementById('driverName').textContent = nameZh || '';
  document.getElementById('driverAddr').textContent = addrZh || '';
  driver.hidden = false;
}
document.getElementById('driverClose').addEventListener('click', () => (driver.hidden = true));
driver.addEventListener('click', (e) => { if (e.target === driver) driver.hidden = true; });

export const empty = (icon, text) => `<div class="empty"><div class="empty-ico">${icon}</div><p>${text}</p></div>`;

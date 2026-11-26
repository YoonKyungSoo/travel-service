// 참고 사이트 탭: 블로그·후기 링크를 제목 붙여서 모아두기
import { S, add, update, remove, byId } from './state.js';
import { esc, toast } from './util.js';
import { formModal, field, input, textarea, empty } from './ui.js';

const host = (url) => { try { return new URL(url).hostname.replace(/^(www|m)\./, ''); } catch { return ''; } };
const sorted = () => [...S.data.links].sort((a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0));
const normUrl = (u) => (/^https?:\/\//i.test(u) ? u : 'https://' + u);

export function renderLinks(el) {
  const list = sorted();
  el.innerHTML = `
    <header class="page-head">
      <div><h1>참고 사이트</h1><span class="meta">블로그 · 후기 링크 ${list.length}개</span></div>
      <button type="button" class="btn primary" id="addLink"><svg class="i"><use href="#i-plus"/></svg>추가</button>
    </header>
    <form class="quick-add" id="quickLink">
      <input name="url" type="url" inputmode="url" placeholder="링크 붙여넣기 (https://…)" autocomplete="off" enterkeyhint="done" />
      <button type="submit" class="btn primary" aria-label="추가"><svg class="i"><use href="#i-plus"/></svg></button>
    </form>
    ${list.length ? `<ul class="link-list">${list.map((l) => `
      <li class="link-card">
        <a class="link-main" href="${esc(l.url)}" target="_blank" rel="noopener">
          <span class="link-ico"><svg class="i"><use href="#i-link"/></svg></span>
          <span class="link-text">
            <b>${esc(l.title || host(l.url) || l.url)}</b>
            ${l.memo ? `<small class="link-memo">${esc(l.memo)}</small>` : ''}
            <small class="link-host">${esc(host(l.url))}</small>
          </span>
        </a>
        <button type="button" class="icon-btn" data-link-edit="${l.id}" aria-label="제목·메모 수정"><svg class="i"><use href="#i-edit"/></svg></button>
      </li>`).join('')}</ul>` : empty('', '블로그·후기 링크를 붙여넣어 두면<br>제목을 붙여서 보기 좋게 모아둘 수 있어요.')}`;

  el.querySelector('#addLink').onclick = () => linkForm();
  const qa = el.querySelector('#quickLink');
  qa.onsubmit = (e) => {
    e.preventDefault();
    const url = qa.url.value.trim();
    if (!url) return;
    linkForm(null, normUrl(url)); // 제목을 바로 붙일 수 있게 폼으로
  };
  el.querySelectorAll('[data-link-edit]').forEach((b) => { b.onclick = () => linkForm(byId('links', b.dataset.linkEdit)); });
}

export function linkForm(l = null, presetUrl = '') {
  formModal({
    title: l ? '참고 사이트 수정' : '참고 사이트 추가',
    canDelete: !!l,
    fields: `
      ${field('제목 *', input('title', l?.title, 'required placeholder="예) 양꼬치 & 베이징덕 맛집 정리" autocomplete="off"'), '목록에 보일 이름이에요.')}
      ${field('링크 *', input('url', l?.url || presetUrl, 'type="url" inputmode="url" required placeholder="https://" autocomplete="off"'))}
      ${field('메모', textarea('memo', l?.memo, 'placeholder="어떤 내용인지 짧게 (예: 맛집 BEST10, 주문 방법)"'))}`,
    onSubmit: async (v) => {
      if (!v.url) { toast('링크를 입력하세요.'); return false; }
      v.url = normUrl(v.url);
      if (!v.title) v.title = host(v.url);
      if (l) await update('links', l.id, v);
      else await add('links', { ...v, order: Date.now() });
    },
    onDelete: () => remove('links', l.id),
  });
}

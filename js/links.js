// 가이드 탭: 회화 · 참고 사이트 · 여행 정보
import { S, add, update, remove, byId, local } from './state.js';
import { esc, toast, fmtDate, dday } from './util.js';
import { formModal, field, input, textarea, empty, showDriver } from './ui.js';
import { PHRASE_GROUPS } from './phrases.js';

let seg = local.get('ts:guideSeg') || 'talk'; // talk | links | trip
let group = 'all';

const host = (url) => { try { return new URL(url).hostname.replace(/^(www|m)\./, ''); } catch { return ''; } };
const sorted = () => [...S.data.links].sort((a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0));
const normUrl = (u) => (/^https?:\/\//i.test(u) ? u : 'https://' + u);

export function renderLinks(el) {
  el.innerHTML = `
    <header class="page-head">
      <div><h1>가이드</h1><span class="meta">회화 · 참고 사이트 · 여행 정보</span></div>
      ${seg === 'links' ? '<button type="button" class="btn primary" data-act="add"><svg class="i"><use href="#i-plus"/></svg>추가</button>' : ''}
    </header>
    <div class="seg-tabs three">
      <button type="button" class="${seg === 'talk' ? 'on' : ''}" data-seg="talk">회화</button>
      <button type="button" class="${seg === 'links' ? 'on' : ''}" data-seg="links">참고 사이트 <small>${S.data.links.length}</small></button>
      <button type="button" class="${seg === 'trip' ? 'on' : ''}" data-seg="trip">여행 정보</button>
    </div>
    ${seg === 'talk' ? talkHtml() : seg === 'links' ? linksHtml() : tripHtml()}`;

  el.onclick = (e) => {
    const t = e.target.closest('button');
    if (!t || !el.contains(t)) return;
    const d = t.dataset;
    if (d.seg) { seg = d.seg; local.set('ts:guideSeg', seg); renderLinks(el); }
    else if (d.group) { group = d.group; renderLinks(el); }
    else if (d.say) { const [, zh, py] = phraseById(d.say); showDriver(zh, py, ''); }
    else if (d.act === 'add') linkForm();
    else if (d.linkEdit) linkForm(byId('links', d.linkEdit));
    else if (d.act === 'who') document.getElementById('whoBtn').click();
    else if (d.act === 'share') document.getElementById('shareBtn').click();
  };
  const qa = el.querySelector('#quickLink');
  if (qa) qa.onsubmit = (e) => {
    e.preventDefault();
    const url = qa.url.value.trim();
    if (url) linkForm(null, normUrl(url)); // 제목을 바로 붙일 수 있게 폼으로
  };
}

// ───────── 회화 ─────────
const phraseById = (id) => { const [g, i] = id.split(':'); return PHRASE_GROUPS.find((x) => x.id === g).items[+i]; };

function talkHtml() {
  const groups = group === 'all' ? PHRASE_GROUPS : PHRASE_GROUPS.filter((g) => g.id === group);
  return `
    <div class="chips wrap">
      <button type="button" class="chip ${group === 'all' ? 'on' : ''}" data-group="all">전체</button>
      ${PHRASE_GROUPS.map((g) => `<button type="button" class="chip ${group === g.id ? 'on' : ''}" data-group="${g.id}">${g.label}</button>`).join('')}
    </div>
    <p class="hint">누르면 화면 가득 크게 보여줘요. 직원에게 화면을 보여주세요.</p>
    ${groups.map((g) => `
      <h3 class="sub">${esc(g.label)} <small>${g.items.length}</small></h3>
      <ul class="phrase-list">${g.items.map(([ko, zh, py], i) => `
        <li><button type="button" class="phrase" data-say="${g.id}:${i}">
          <span class="ph-ko">${esc(ko)}</span>
          <span class="ph-zh">${esc(zh)}</span>
          <span class="ph-py">${esc(py)}</span>
        </button></li>`).join('')}</ul>`).join('')}`;
}

// ───────── 참고 사이트 ─────────
function linksHtml() {
  const list = sorted();
  return `
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

// ───────── 여행 정보 (모바일에선 상단 바 대신 여기서) ─────────
function tripHtml() {
  const t = S.trip;
  const mode = S.store.mode;
  const dd = dday(t.startDate, t.endDate);
  return `
    <div class="card trip-info">
      <p class="ti-name"><b>${esc(t.name)}</b>${dd ? ` <em class="dday">${esc(dd)}</em>` : ''}</p>
      <p class="muted">${fmtDate(t.startDate)} – ${fmtDate(t.endDate)}</p>
      <p class="muted">함께: ${esc((t.members || []).join(', ') || '—')}</p>
      <p class="${mode === 'cloud' ? 'ok' : 'warn'}">${mode === 'cloud' ? '● 실시간 공유 중' : mode === 'local' ? '이 기기에만 저장 중' : '서버 연결 실패 · 이 기기에만 저장'}</p>
      <div class="btn-row">
        <button type="button" class="btn" data-act="who"><svg class="i"><use href="#i-user"/></svg>나: ${esc(S.me || '이름 선택')}</button>
        <button type="button" class="btn primary" data-act="share"><svg class="i"><use href="#i-link"/></svg>링크 공유</button>
      </div>
    </div>`;
}

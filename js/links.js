// 가이드 탭: 회화 · 참고 사이트 · 여행 정보
import { S, add, update, remove, byId, local } from './state.js';
import { esc, toast, fmtDate, dday } from './util.js';
import { formModal, field, input, textarea, empty, showDriver } from './ui.js';
import { PHRASES } from './phrases.js';
import { dest, regionsOf, REGION_BY_ID } from './dest.js';

let seg = local.get('ts:guideSeg') || 'talk'; // talk | links | trip
let group = 'all';

const host = (url) => { try { return new URL(url).hostname.replace(/^(www|m)\./, ''); } catch { return ''; } };
const sorted = (col) => [...S.data[col]].sort((a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0));
const normUrl = (u) => (/^https?:\/\//i.test(u) ? u : 'https://' + u);
const fmtCode = (c) => (c ? `${c.slice(0, 3)}-${c.slice(3)}` : '');

export function renderLinks(el) {
  const addBtn = seg === 'links' ? 'link' : seg === 'talk' ? 'phrase' : '';
  el.innerHTML = `
    <header class="page-head">
      <div><h1>가이드</h1><span class="meta">${esc(dest().country.ko)} ${esc(dest().title)} · 회화 · 참고 사이트 · 여행 정보</span></div>
      ${addBtn ? `<button type="button" class="btn primary" data-act="add-${addBtn}"><svg class="i"><use href="#i-plus"/></svg>${addBtn === 'link' ? '사이트' : '회화'}</button>` : ''}
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
    else if (d.group) { group = d.group === group && group !== 'all' ? 'all' : d.group; renderLinks(el); }
    else if (d.say) { const [, zh, py] = phraseById(d.say); showDriver(zh, py, ''); }
    else if (d.sayMine) { const p = byId('phrases', d.sayMine); showDriver(p.local, p.read || '', ''); }
    else if (d.editPhrase) phraseForm(byId('phrases', d.editPhrase));
    else if (d.act === 'add-phrase') phraseForm();
    else if (d.act === 'add-link') linkForm();
    else if (d.linkEdit) linkForm(byId('links', d.linkEdit));
    else if (d.act === 'who') document.getElementById('whoBtn').click();
    else if (d.act === 'share') document.getElementById('shareBtn').click();
    else if (d.act === 'edit-trip') tripForm();
  };
  const qa = el.querySelector('#quickLink');
  if (qa) qa.onsubmit = (e) => {
    e.preventDefault();
    const url = qa.url.value.trim();
    if (url) linkForm(null, normUrl(url)); // 제목을 바로 붙일 수 있게 폼으로
  };
}

// ───────── 회화 ─────────
const groups = () => PHRASES[dest().country.lang] || PHRASES.zh;
const phraseById = (id) => { const [g, i] = id.split(':'); return groups().find((x) => x.id === g).items[+i]; };

function talkHtml() {
  const lang = dest().country.lang;
  const mine = sorted('phrases').filter((p) => (p.lang || 'zh') === lang);
  const gs = groups();
  const show = (id) => group === 'all' || group === id;
  return `
    <div class="chips wrap">
      <button type="button" class="chip ${group === 'all' ? 'on' : ''}" data-group="all">전체</button>
      <button type="button" class="chip ${group === 'mine' ? 'on' : ''}" data-group="mine">★ 내 회화 <small>${mine.length}</small></button>
      ${gs.map((g) => `<button type="button" class="chip ${group === g.id ? 'on' : ''}" data-group="${g.id}">${g.label}</button>`).join('')}
    </div>
    ${show('mine') ? `
      <h3 class="sub">내 회화 <small>${mine.length}</small></h3>
      ${mine.length ? `<ul class="phrase-list">${mine.map((p) => `
        <li class="phrase-mine"><button type="button" class="phrase" data-say-mine="${p.id}">
          <span class="ph-ko">${esc(p.ko)}</span>
          <span class="ph-zh">${esc(p.local)}</span>
          ${p.read ? `<span class="ph-py">${esc(p.read)}</span>` : ''}
        </button><button type="button" class="icon-btn" data-edit-phrase="${p.id}" aria-label="수정"><svg class="i"><use href="#i-edit"/></svg></button></li>`).join('')}</ul>`
        : '<p class="hint">자주 쓸 문장을 <b>+ 회화</b>로 추가해 두세요. 같이 가는 사람에게도 보여요.</p>'}` : ''}
    ${gs.filter((g) => show(g.id)).map((g) => `
      <h3 class="sub">${esc(g.label)} <small>${g.items.length}</small></h3>
      <ul class="phrase-list">${g.items.map(([ko, zh, py], i) => `
        <li><button type="button" class="phrase" data-say="${g.id}:${i}">
          <span class="ph-ko">${esc(ko)}</span>
          <span class="ph-zh">${esc(zh)}</span>
          <span class="ph-py">${esc(py)}</span>
        </button></li>`).join('')}</ul>`).join('')}`;
}

function phraseForm(p = null) {
  const d = dest();
  formModal({
    title: p ? '회화 수정' : '회화 추가',
    canDelete: !!p,
    fields: `
      ${field('한국어 뜻 *', input('ko', p?.ko, 'required placeholder="예) 이거 하나 더 주세요" autocomplete="off"'))}
      ${field(`${d.country.langKo} *`, input('local', p?.local, `required placeholder="${d.country.id === 'JP' ? '例) これをもう一つください' : '例) 这个再来一个'}" autocomplete="off"`), '번역기에서 복사해 붙여넣어도 돼요.')}
      ${field('읽는 법', input('read', p?.read, `placeholder="${d.country.id === 'JP' ? 'kore o mō hitotsu kudasai' : 'zhège zài lái yí ge'}" autocomplete="off"`))}`,
    onSubmit: async (v) => {
      if (!v.ko || !v.local) { toast('한국어 뜻과 현지어를 입력하세요.'); return false; }
      if (p) await update('phrases', p.id, v);
      else await add('phrases', { ...v, lang: d.country.lang, order: Date.now() });
      toast('저장했어요.');
    },
    onDelete: () => remove('phrases', p.id),
  });
}

// ───────── 참고 사이트 ─────────
function linksHtml() {
  const list = sorted('links');
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

// ───────── 여행 정보 ─────────
function tripHtml() {
  const t = S.trip;
  const d = dest();
  const mode = S.store.mode;
  const dd = dday(t.startDate, t.endDate);
  return `
    <div class="card trip-info">
      <p class="ti-name"><b>${esc(t.name)}</b>${dd ? ` <em class="dday">${esc(dd)}</em>` : ''}</p>
      <p class="muted">${esc(d.country.ko)} ${esc(d.title)} · ${fmtDate(t.startDate)} – ${fmtDate(t.endDate)}</p>
      <p class="muted">함께 ${(t.members || []).length}명: ${esc((t.members || []).join(', ') || '—')}</p>
      <p class="${mode === 'cloud' ? 'ok' : 'warn'}">${mode === 'cloud' ? '● 실시간 공유 중' : mode === 'local' ? '이 기기에만 저장 중' : '서버 연결 실패 · 이 기기에만 저장'}</p>
      <div class="btn-row">
        <button type="button" class="btn" data-act="who"><svg class="i"><use href="#i-user"/></svg>나: ${esc(S.me || '이름 선택')}</button>
        <button type="button" class="btn" data-act="edit-trip"><svg class="i"><use href="#i-edit"/></svg>여행 수정</button>
        <a class="btn ghost" href="#/home"><svg class="i"><use href="#i-map"/></svg>내 여행 목록 · 새 여행</a>
      </div>
    </div>
    <div class="card trip-info">
      ${t.uids ? `<p class="ti-name"><b>초대 코드</b> <span class="code-chip">${esc(fmtCode(t.joinCode) || '없음')}</span></p>
        <p class="muted">코드를 입력한 기기만 이 여행에 들어올 수 있어요.</p>`
      : `<p class="ti-name"><b>초대 코드</b></p>
        <p class="warn">아직 링크만 알면 누구나 들어올 수 있어요. 초대 코드를 만들면 잠겨요. (지금까지 데이터는 그대로)</p>`}
      <div class="btn-row"><button type="button" class="btn primary" data-act="share"><svg class="i"><use href="#i-link"/></svg>${t.uids ? '초대하기' : '초대 코드 만들기'}</button></div>
    </div>
    <section class="card country-info">
      <h3>${esc(d.country.ko)} 여행 정보</h3>
      <dl class="facts">${d.country.info.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    </section>`;
}

/** 여행 이름·날짜·지역·멤버 수정 (나라는 바꿀 수 없음: 좌표계·통화가 달라서) */
function tripForm() {
  const t = S.trip;
  const d = dest();
  formModal({
    title: '여행 수정',
    canDelete: true,
    fields: `
      ${field('여행 이름', input('name', t.name, 'autocomplete="off"'))}
      <div class="grid2">
        ${field('출발', input('startDate', t.startDate, 'type="date"'))}
        ${field('도착', input('endDate', t.endDate, 'type="date"'))}
      </div>
      <div class="field"><span class="field-label">지역 (${esc(d.country.ko)})</span>
        <div class="seg">${regionsOf(d.country.id).map((r) => `<label><input type="radio" name="_region" value="${r.id}" ${r.id === d.primary.id ? 'checked' : ''} /><span>${esc(r.ko)}</span></label>`).join('')}</div>
      </div>
      ${field('같이 가는 사람', input('_members', (t.members || []).join(', '), 'autocomplete="off"'), '쉼표로 구분. 이름을 지우면 지출·준비물 기록의 그 이름은 그대로 남아요.')}`,
    onSubmit: async (v, form) => {
      const regions = [...form.querySelectorAll('input[name=_region]:checked')].map((i) => i.value).filter((id) => REGION_BY_ID[id]);
      const members = [...new Set(v._members.split(/[,，、]/).map((s) => s.trim()).filter(Boolean))];
      if (!regions.length) { toast('지역을 고르세요.'); return false; }
      if (!members.length) { toast('사람을 한 명 이상 적어주세요.'); return false; }
      if (!v.startDate || !v.endDate || v.endDate < v.startDate) { toast('날짜를 확인하세요.'); return false; }
      const patch = { name: v.name || t.name, startDate: v.startDate, endDate: v.endDate, members };
      // 예전 상하이 여행은 나라 정보가 없음 → 지역을 바꾸면 그때 나라도 저장
      if (!t.country) patch.country = d.country.id;
      patch.regions = regions;
      await S.store.updateTrip(S.key, patch);
      toast('저장했어요.');
    },
    onDelete: async () => {
      if (!confirm(`"${t.name}"의 모든 데이터(장소·일정·숙소·준비물·지출·회화·참고 사이트)가 다 지워집니다.\n같이 쓰는 사람에게서도 사라지고 되돌릴 수 없어요.\n\n그래도 삭제하시겠습니까?`)) return;
      const key = S.key;
      // 화면이 지워지는 여행을 계속 보고 있지 않게 먼저 닫음 (app.js가 처리)
      window.dispatchEvent(new CustomEvent('trip:deleting', { detail: key }));
      try {
        await S.store.deleteTrip(key, t.joinCode);
        toast('여행을 삭제했어요.');
      } catch (err) {
        console.error(err);
        toast('삭제하지 못했어요. 인터넷 연결을 확인하세요.');
      }
    },
  });
}

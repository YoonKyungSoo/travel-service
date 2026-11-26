// 시작점: 저장소 연결 → 주소(#/t/여행키/탭) 해석 → 화면 표시
import { S, COLLECTIONS, notify, local, onChange } from './state.js';
import { createStore } from './store.js';
import { TRIP_DEFAULT, SEED } from './data.js';
import { esc, newId, fmtDate, toast, dday } from './util.js';
import { openModal, closeModal } from './ui.js';
import { initMap, showMap, detectDistrict } from './map.js';
import { PACK_VERSION, PACK_PLACES, PACK_STAYS, PACK_SCHEDULE, PACK_CHECKLIST, PACK_CHECK_NOTES, PACK_WISH, PACK_FLIGHT_FIX, PACK_REFRESH, PACK_LINKS } from './pack.js';
import { renderSchedule } from './schedule.js';
import { renderStay } from './stay.js';
import { renderChecklist } from './checklist.js';
import { renderLinks } from './links.js';
import { initTopInfo, paintMode } from './topinfo.js';
import { renderExpense } from './expense.js';

const PAGES = { schedule: renderSchedule, stay: renderStay, checklist: renderChecklist, expense: renderExpense, links: renderLinks };
const TABS = ['map', 'schedule', 'stay', 'checklist', 'expense', 'links'];
const LAST_KEY = 'ts:lastKey';

const $ = (id) => document.getElementById(id);
const nav = $('nav');
const pageEl = $('view-page');
const landingEl = $('view-landing');
const mapEl = $('view-map');

let currentTab = null;
let unsubs = [];

// ───────── 주소 해석 ─────────
function parseHash() {
  const m = location.hash.match(/^#\/t\/([A-Za-z0-9]{16,})(?:\/(\w+))?/);
  return m ? { key: m[1], tab: TABS.includes(m[2]) ? m[2] : 'map' } : null;
}

async function route() {
  const r = parseHash();
  if (!r) {
    const last = local.get(LAST_KEY);
    if (last && !location.hash.startsWith('#/new')) { location.replace(`#/t/${last}/map`); return; }
    return showLanding();
  }
  if (r.key !== S.key) await openTrip(r.key);
  if (!S.trip) return; // openTrip에서 안내 화면 표시
  showTab(r.tab);
}

function showTab(tab) {
  currentTab = tab;
  landingEl.hidden = true;
  nav.hidden = false;
  document.body.classList.toggle('on-map', tab === 'map');
  nav.querySelectorAll('[data-tab]').forEach((a) => {
    a.href = `#/t/${S.key}/${a.dataset.tab}`;
    a.classList.toggle('on', a.dataset.tab === tab);
  });
  if (tab === 'map') {
    pageEl.hidden = true;
    mapEl.hidden = false;
    showMap();
  } else {
    mapEl.hidden = true;
    pageEl.hidden = false;
    renderPage();
    pageEl.scrollTop = 0;
    window.scrollTo(0, 0);
  }
}

function renderPage() {
  if (!currentTab || currentTab === 'map' || !S.trip) return;
  // 입력 중이던 스크롤 위치 유지
  const y = window.scrollY;
  PAGES[currentTab](pageEl);
  window.scrollTo(0, y);
}

// ───────── 여행 열기 / 만들기 ─────────
async function openTrip(key) {
  unsubs.forEach((u) => u());
  unsubs = [];
  S.key = key;
  S.trip = null;
  COLLECTIONS.forEach((c) => (S.data[c] = []));

  const trip = await S.store.getTrip(key);
  if (!trip) {
    S.key = null;
    showLanding('이 링크의 여행을 찾을 수 없어요. 링크를 다시 확인하거나 새 여행을 만드세요.');
    return;
  }
  S.trip = trip;
  local.set(LAST_KEY, key);

  unsubs.push(S.store.watchTrip(key, (t) => {
    if (!t) return;
    S.trip = t;
    paintHeader();
    notify('trip');
  }));
  const firstLoads = COLLECTIONS.map((c) => new Promise((resolve) => {
    unsubs.push(S.store.watch(key, c, (items) => {
      S.data[c] = items;
      notify(c);
      resolve();
    }));
  }));
  S.me = local.get(`ts:me:${key}`);
  paintHeader();
  if (!S.me || !trip.members?.includes(S.me)) askWho();
  notify('all');
  // 추천 데이터(가이드 정리본)를 아직 안 넣은 여행이면 한 번 넣기
  if ((trip.pack || 0) < PACK_VERSION) {
    Promise.race([Promise.all(firstLoads), new Promise((r) => setTimeout(r, 8000))])
      .then(() => applyPack(key))
      .catch((e) => console.error('추천 데이터 넣기 실패', e));
  }
}

async function applyPack(key) {
  if (S.key !== key) return;
  const has = (col, id) => S.data[col].some((x) => x.id === id);
  const places = PACK_PLACES.filter((p) => !has('places', p.id))
    .map((p) => ({ ...p, district: typeof p.lat === 'number' ? detectDistrict(p.lat, p.lng) : undefined }));
  const texts = S.data.checklist.map((c) => c.text || '');
  const checklist = PACK_CHECKLIST.filter((c) => !has('checklist', c.id) && !texts.some((t) => t.includes(c.match)))
    .map(({ match, ...c }, i) => ({ ...c, assignee: '공용', checked: false, order: 100 + i })); // eslint-disable-line no-unused-vars
  const schedule = PACK_SCHEDULE.filter((s) => !has('schedule', s.id));
  const stays = PACK_STAYS.filter((s) => !has('stays', s.id)).map((s) => ({ ...s, district: detectDistrict(s.lat, s.lng) }));
  await S.store.putMany(key, { places, checklist, schedule, stays });
  // 이미 있는 앱 설치 항목에 사용 팁 붙이기
  for (const [word, note] of PACK_CHECK_NOTES) {
    const c = S.data.checklist.find((x) => x.group === '앱 설치' && (x.text || '').includes(word) && !x.note);
    if (c) S.store.update(key, 'checklist', c.id, { note });
  }
  // 지점 주소가 정해진 추천 장소: 이름·주소·위치·메모 갱신 (★는 건드리지 않음)
  for (const id of PACK_REFRESH) {
    const cur = S.data.places.find((x) => x.id === id);
    const nw = PACK_PLACES.find((x) => x.id === id);
    if (!cur || cur.src !== 'pack' || cur.edited || !nw) continue; // 직접 고친 적 있으면 그대로 둠
    const { id: _i, wish: _w, visited: _v, src: _s, ...fields } = nw; // eslint-disable-line no-unused-vars
    fields.approx = !!nw.approx;
    if (typeof nw.lat === 'number') fields.district = detectDistrict(nw.lat, nw.lng);
    S.store.update(key, 'places', id, fields);
  }
  // ★ 즐겨찾기: 이미 들어간 추천 장소에도
  for (const id of PACK_WISH) {
    const p = S.data.places.find((x) => x.id === id);
    if (p && !p.wish) S.store.update(key, 'places', id, { wish: true });
  }
  // 항공 일정 변경: 예전 가는 편이 그대로면 고치고, 여행 시작일·추천 숙소 체크인도 하루 앞당김
  const fx = PACK_FLIGHT_FIX;
  const oldFlight = S.data.transports.find(fx.match);
  if (oldFlight) S.store.update(key, 'transports', oldFlight.id, fx.patch);
  const tripPatch = { pack: PACK_VERSION };
  // 참고 사이트는 새 컬렉션이라 보안 규칙을 다시 게시해야 저장됨 → 실패하면 다음에 다시 시도
  const links = PACK_LINKS.filter((l) => !has('links', l.id));
  if (links.length) {
    try { await S.store.putMany(key, { links }); } catch (e) { console.error('참고 사이트 넣기 실패 (firestore.rules 다시 게시 필요)', e); tripPatch.pack = 3; }
  }
  if (S.trip.startDate === fx.tripFrom) tripPatch.startDate = fx.tripTo;
  const st = S.data.stays.find((x) => x.id === 'pk_stay_bluemountain');
  if (st && st.checkIn === fx.tripFrom) S.store.update(key, 'stays', st.id, { checkIn: fx.tripTo });
  const d1a = S.data.schedule.find((x) => x.id === 'pk_sch_d1a');
  if (d1a && d1a.memo === '도착 후 숙소에 짐 두고 출발') S.store.update(key, 'schedule', d1a.id, { memo: '' });
  await S.store.updateTrip(key, tripPatch);
  if (places.length) toast(`추천 장소 ${places.length}곳과 일정을 불러왔어요.`);
}

function paintHeader() {
  $('tripName').textContent = S.trip.name;
  const mode = S.store.mode;
  // 모바일 상단 바에는 날짜 옆에 저장 방식을 짧게 표시
  const short = mode === 'cloud' ? '' : mode === 'local' ? ' · 이 기기 저장' : ' · 연결 실패';
  $('tripDates').innerHTML = `${fmtDate(S.trip.startDate)} – ${fmtDate(S.trip.endDate)}<span class="mode-short">${short}</span>`;
  $('whoBtn').querySelector('span').textContent = S.me || '이름 선택';
  const dd = dday(S.trip.startDate, S.trip.endDate);
  $('dday').textContent = dd;
  $('dday').hidden = !dd;
  $('modeBadge').textContent = mode === 'cloud' ? '● 실시간 공유 중' : mode === 'local' ? '이 기기에만 저장 중' : '서버 연결 실패 · 이 기기에만 저장';
  $('modeBadge').className = mode === 'cloud' ? 'ok' : 'warn';
  initTopInfo($('topInfo')); // 날씨·환율 (처음 한 번 연결, 이후엔 다시 그리기)
  paintMode();
}

function askWho() {
  const members = S.trip.members || [];
  openModal('나는 누구인가요?', `
    <p class="muted">이 기기에서 쓸 이름을 골라주세요. 지출 결제자, 준비물 담당자에 자동으로 들어갑니다.</p>
    <div class="who-list">
      ${members.map((m) => `<button type="button" class="btn big" data-who="${esc(m)}">${esc(m)}</button>`).join('')}
    </div>`, (body) => {
    body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-who]');
      if (!b) return;
      S.me = b.dataset.who;
      local.set(`ts:me:${S.key}`, S.me);
      paintHeader();
      closeModal();
      notify('me');
    });
  });
}

function showLanding(msg) {
  nav.hidden = true;
  mapEl.hidden = true;
  pageEl.hidden = true;
  landingEl.hidden = false;
  document.body.classList.remove('on-map');
  landingEl.innerHTML = `
    <div class="landing">
      <div class="hero">
        <span class="hero-tag">ICN → SHA · DEC 9–13</span>
        <h1><span class="zh-big">上海</span>상하이 가보자고</h1>
        <p>지도 · 일정 · 숙소 · 준비물 · 지출 — 둘이 한 링크로.</p>
      </div>
      ${msg ? `<p class="notice warn">${esc(msg)}</p>` : ''}
      <form id="newTrip" class="form card">
        <h2>새 여행 만들기</h2>
        <label class="field"><span class="field-label">여행 이름</span><input name="name" value="${esc(TRIP_DEFAULT.name)}" /></label>
        <div class="grid2">
          <label class="field"><span class="field-label">출발</span><input type="date" name="startDate" value="${TRIP_DEFAULT.startDate}" /></label>
          <label class="field"><span class="field-label">도착</span><input type="date" name="endDate" value="${TRIP_DEFAULT.endDate}" /></label>
        </div>
        <div class="grid2">
          <label class="field"><span class="field-label">내 이름</span><input name="m1" placeholder="예) 나" required autocomplete="off" /></label>
          <label class="field"><span class="field-label">동행 이름</span><input name="m2" placeholder="예) 친구" autocomplete="off" /></label>
        </div>
        <button type="submit" class="btn primary big">만들기 →</button>
        <p class="hint">만든 뒤 나오는 링크를 동행에게 보내면 같이 쓸 수 있어요. 링크를 아는 사람만 들어올 수 있습니다.</p>
      </form>
      <p class="hint">이미 받은 링크가 있다면 그 링크로 바로 들어가면 됩니다.</p>
    </div>`;
  $('newTrip').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const m1 = f.m1.value.trim();
    const m2 = f.m2.value.trim();
    if (!m1) return toast('내 이름을 입력하세요.');
    if (m2 && m2 === m1) return toast('이름이 서로 달라야 해요.');
    if (f.endDate.value < f.startDate.value) return toast('날짜를 확인하세요.');
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = '만드는 중…';
    const key = newId(20);
    try {
      await S.store.createTrip(key, {
        name: f.name.value.trim() || TRIP_DEFAULT.name,
        startDate: f.startDate.value,
        endDate: f.endDate.value,
        fxRate: TRIP_DEFAULT.fxRate,
        members: [m1, m2].filter(Boolean),
      }, SEED);
      local.set(`ts:me:${key}`, m1);
      location.hash = `#/t/${key}/map`;
      setTimeout(shareLink, 600);
    } catch (err) {
      console.error(err);
      toast('만들지 못했어요. 인터넷 연결 / Firebase 설정을 확인하세요.');
      btn.disabled = false;
      btn.textContent = '만들기';
    }
  });
}

// ───────── 링크 공유 ─────────
function shareLink() {
  const url = `${location.origin}${location.pathname}#/t/${S.key}/map`;
  const warn = S.store.mode !== 'cloud'
    ? '<p class="notice warn">지금은 Firebase가 연결되지 않아 이 기기에만 저장됩니다. 링크를 보내도 내용이 공유되지 않아요. (README의 Firebase 설정 참고)</p>'
    : '';
  openModal('링크 공유', `
    ${warn}
    <p>이 링크를 동행에게 보내세요. <b>링크를 아는 사람은 누구나 보고 수정할 수 있으니</b> 단체방 등에는 올리지 마세요.</p>
    <div class="copy-box"><input readonly value="${esc(url)}" id="shareUrl" /></div>
    <div class="btn-row">
      <button type="button" class="btn primary" id="copyUrl">링크 복사</button>
      ${navigator.share ? '<button type="button" class="btn" id="nativeShare">공유하기</button>' : ''}
    </div>
    <p class="hint">휴대폰에서 이 페이지를 연 뒤 <b>공유 → 홈 화면에 추가</b>하면 앱처럼 바로 열 수 있어요.</p>`, (body) => {
    body.querySelector('#copyUrl').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(url); toast('복사했어요.'); }
      catch { body.querySelector('#shareUrl').select(); document.execCommand('copy'); toast('복사했어요.'); }
    });
    body.querySelector('#nativeShare')?.addEventListener('click', () => navigator.share({ title: S.trip.name, url }).catch(() => {}));
  });
}

// ───────── 시작 ─────────
async function boot() {
  $('shareBtn').addEventListener('click', shareLink);
  $('whoBtn').addEventListener('click', askWho);
  window.addEventListener('hashchange', route);

  S.store = await createStore();
  await initMap();
  // 데이터가 바뀌면 지도 외 화면 다시 그리기 (입력 모달이 열려 있어도 배경만 갱신)
  onChange(() => renderPage());
  await route();
}

boot().catch((e) => {
  console.error(e);
  document.body.innerHTML = `<p style="padding:24px">페이지를 불러오지 못했어요. 새로고침 해주세요.<br><small>${esc(e.message)}</small></p>`;
});

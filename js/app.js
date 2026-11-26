// 시작점: 저장소 연결 → 주소(#/t/여행키/탭) 해석 → 화면 표시
import { S, COLLECTIONS, notify, local, onChange } from './state.js';
import { createStore } from './store.js';
import { BASE_CHECKLIST } from './data.js';
import { dest, COUNTRIES, regionsOf } from './dest.js';
import { esc, newId, fmtDate, toast, dday } from './util.js';
import { openModal, closeModal } from './ui.js';
import { initMap, showMap, detectDistrict, applyDest } from './map.js';
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
  const join = location.hash.match(/^#\/join\/([A-Za-z0-9-]+)/);
  if (join) return showJoin(normCode(join[1]));
  const r = parseHash();
  if (!r) {
    // 사이트 주소만으로 들어오면 항상 첫 화면 (내 여행 · 초대 코드 참가 · 새 여행). 여행은 목록에서 골라 들어감
    S.key = null;
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
  if (trip?.denied) { // 초대 코드로 잠긴 여행인데 이 기기는 아직 멤버가 아님
    S.key = null;
    forgetTrip(key);
    showJoin('', '이 여행은 초대 코드가 있어야 들어올 수 있어요. 받은 코드를 입력하세요.');
    return;
  }
  if (!trip) {
    S.key = null;
    forgetTrip(key);
    showLanding('이 링크의 여행을 찾을 수 없어요. 링크를 다시 확인하거나 새 여행을 만드세요.');
    return;
  }
  S.trip = trip;
  local.set(LAST_KEY, key);
  rememberTrip(key, trip);
  await applyDest(); // 지도를 여행지(나라·지역)에 맞추기

  let deniedShown = false;
  const onDenied = () => {
    if (deniedShown || S.key !== key) return;
    deniedShown = true;
    unsubs.forEach((u) => u());
    unsubs = [];
    S.key = null;
    forgetTrip(key);
    showJoin('', '이 여행에 초대 코드가 생겼어요. 받은 코드를 입력하면 다시 들어올 수 있어요. (지금까지 데이터는 그대로예요)');
  };
  unsubs.push(S.store.watchTrip(key, (t) => {
    if (!t) return;
    S.trip = t;
    rememberTrip(key, t);
    paintHeader();
    notify('trip');
  }, onDenied));
  const firstLoads = COLLECTIONS.map((c) => new Promise((resolve) => {
    unsubs.push(S.store.watch(key, c, (items) => {
      S.data[c] = items;
      notify(c);
      resolve();
    }, onDenied));
  }));
  S.me = local.get(`ts:me:${key}`);
  paintHeader();
  if (!S.me || !trip.members?.includes(S.me)) askWho();
  else if (!trip.uids && S.store.mode === 'cloud' && !local.get(`ts:inviteAsked:${key}`)) {
    local.set(`ts:inviteAsked:${key}`, '1');
    setTimeout(shareLink, 800); // 초대 코드 만들기 안내
  }
  notify('all');
  // 추천 데이터(상하이 가이드 정리본): 예전 상하이 여행(나라 정보 없음)에만 한 번 넣기
  if (!trip.country && (trip.pack || 0) < PACK_VERSION) {
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

const APP_TITLE = '같이 가는 여행';

function paintHeader() {
  $('tripName').textContent = S.trip.name;
  document.title = `${S.trip.name} · ${APP_TITLE}`; // 브라우저 탭에 지금 여행 이름
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

// ───────── 첫 화면: 내 여행 · 초대 코드로 참가 · 새 여행 만들기 ─────────
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 0·O·1·I 제외
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
const fmtCode = (c) => (c ? `${c.slice(0, 3)}-${c.slice(3)}` : '');
const normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** 이 기기에서 열어본 여행 목록 (첫 화면에 보여주기용) */
const RECENT = 'ts:recent';
const recentTrips = () => { try { return JSON.parse(local.get(RECENT) || '[]'); } catch { return []; } };
function rememberTrip(key, t) {
  const item = { key, name: t.name, country: t.country || 'CN', regions: t.regions || ['shanghai'], startDate: t.startDate, endDate: t.endDate };
  local.set(RECENT, JSON.stringify([item, ...recentTrips().filter((x) => x.key !== key)].slice(0, 20)));
}
function forgetTrip(key) {
  local.set(RECENT, JSON.stringify(recentTrips().filter((x) => x.key !== key)));
  if (local.get(LAST_KEY) === key) local.set(LAST_KEY, '');
}

function hideApp() {
  document.title = APP_TITLE;
  nav.hidden = true;
  mapEl.hidden = true;
  pageEl.hidden = true;
  landingEl.hidden = false;
  document.body.classList.remove('on-map');
  window.scrollTo(0, 0);
}

function showLanding(msg) {
  hideApp();
  const trips = recentTrips();
  const today = new Date().toISOString().slice(0, 10);
  const tripRow = (t) => {
    const d = dest(t);
    const state = t.endDate < today ? '다녀옴' : t.startDate <= today ? '여행 중' : dday(t.startDate, t.endDate);
    return `<li><a class="trip-row" href="#/t/${esc(t.key)}/map">
      <span class="trip-local">${esc(d.primary.local)}</span>
      <span class="row-main"><b>${esc(t.name)}</b><small>${esc(d.country.ko)} ${esc(d.title)} · ${fmtDate(t.startDate)} – ${fmtDate(t.endDate)}</small></span>
      ${state ? `<em class="cat-tag">${esc(state)}</em>` : ''}
    </a></li>`;
  };
  landingEl.innerHTML = `
    <div class="landing">
      <div class="hero">
        <span class="hero-tag">CHINA · JAPAN</span>
        <h1><span class="zh-big">旅</span>같이 가는 여행</h1>
        <p>지도 · 일정 · 숙소 · 준비물 · 지출 — 초대 코드로 같이 써요.</p>
      </div>
      ${msg ? `<p class="notice warn">${esc(msg)}</p>` : ''}
      ${trips.length ? `<section class="card">
        <h2>내 여행</h2>
        <ul class="trip-list">${trips.map(tripRow).join('')}</ul>
      </section>` : ''}
      <form id="joinForm" class="form card">
        <h2>초대 코드로 참가</h2>
        <div class="grid2">
          <label class="field"><span class="field-label">초대 코드</span><input name="code" placeholder="ABC-234" autocomplete="off" autocapitalize="characters" required /></label>
          <label class="field"><span class="field-label">내 이름</span><input name="name" placeholder="예) 홍길동" autocomplete="off" required /></label>
        </div>
        <button type="submit" class="btn primary big">참가하기 →</button>
      </form>
      ${newTripFormHtml()}
    </div>`;
  bindJoinForm($('joinForm'));
  bindNewTripForm($('newTrip'));
}

/** 초대 링크(#/join/코드)로 들어왔을 때 */
function showJoin(code, msg) {
  hideApp();
  landingEl.innerHTML = `
    <div class="landing">
      <div class="hero">
        <span class="hero-tag">INVITE</span>
        <h1><span class="zh-big">招</span>여행에 초대됐어요</h1>
        <p>이름을 적고 참가하면 이 기기에서 바로 같이 쓸 수 있어요.</p>
      </div>
      ${msg ? `<p class="notice warn">${esc(msg)}</p>` : ''}
      <form id="joinForm" class="form card">
        <h2>초대 코드로 참가</h2>
        <label class="field"><span class="field-label">초대 코드</span><input name="code" value="${esc(fmtCode(code))}" placeholder="ABC-234" autocomplete="off" autocapitalize="characters" required /></label>
        <label class="field"><span class="field-label">내 이름</span><input name="name" placeholder="예) 홍길동" autocomplete="off" required /></label>
        <p class="hint">같이 가는 사람들 사이에서 부를 이름이에요. 이미 등록된 이름과 같게 쓰면 그 사람으로 들어가요.</p>
        <button type="submit" class="btn primary big">참가하기 →</button>
      </form>
      <p class="hint"><a href="#/home">처음 화면으로</a></p>
    </div>`;
  bindJoinForm($('joinForm'));
  if (code) setTimeout(() => $('joinForm').elements.name.focus(), 100);
}

function bindJoinForm(f) {
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = normCode(f.code.value);
    const name = f.elements.name.value.trim();
    if (code.length !== 6) return toast('초대 코드 6자리를 확인하세요.');
    if (!name) return toast('이름을 입력하세요.');
    if (S.store.mode !== 'cloud') return toast('서버에 연결되지 않아 참가할 수 없어요. 인터넷을 확인하세요.');
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = '확인 중…';
    try {
      const key = await S.store.lookupInvite(code);
      if (!key) throw new Error('nocode');
      await S.store.joinTrip(key, code, name);
      local.set(`ts:me:${key}`, name);
      S.key = null; // 새로 열기
      const target = `#/t/${key}/map`;
      if (location.hash === target) route();
      else location.hash = target;
      toast('참가했어요!');
    } catch (err) {
      console.error(err);
      toast(err.message === 'nocode' ? '없는 초대 코드예요. 다시 확인하세요.' : '참가하지 못했어요. 코드가 바뀌었는지 확인하세요.');
      btn.disabled = false;
      btn.textContent = '참가하기 →';
    }
  });
}

function newTripFormHtml() {
  const regionChips = (c) => regionsOf(c).map((r, i) => `<label><input type="checkbox" name="region" value="${r.id}" ${i === 0 ? 'checked' : ''} /><span>${esc(r.ko)}</span></label>`).join('');
  return `<form id="newTrip" class="form card">
    <h2>새 여행 만들기</h2>
    <div class="field"><span class="field-label">나라</span>
      <div class="seg country-seg">${Object.values(COUNTRIES).map((c, i) => `<label><input type="radio" name="country" value="${c.id}" ${i === 0 ? 'checked' : ''} /><span>${c.ko}</span></label>`).join('')}</div>
    </div>
    <div class="field"><span class="field-label">지역 <small>(여러 곳 가능)</small></span>
      <div class="seg" data-regions>${regionChips('CN')}</div>
    </div>
    <label class="field"><span class="field-label">여행 이름</span><input name="name" placeholder="비우면 지역 이름으로" autocomplete="off" /></label>
    <div class="grid2">
      <label class="field"><span class="field-label">출발</span><input type="date" name="startDate" required /></label>
      <label class="field"><span class="field-label">도착</span><input type="date" name="endDate" required /></label>
    </div>
    <label class="field"><span class="field-label">내 이름</span><input name="m1" placeholder="예) 홍길동" required autocomplete="off" /></label>
    <label class="field"><span class="field-label">같이 가는 사람 <small>(쉼표로 구분, 나중에 초대 코드로 참가해도 돼요)</small></span><input name="others" placeholder="예) 김철수, 이영희" autocomplete="off" /></label>
    <button type="submit" class="btn primary big">만들기 →</button>
    <p class="hint">만들면 <b>초대 코드</b>가 나와요. 코드를 받은 사람만 이 여행에 들어올 수 있어요.</p>
  </form>`;
}

async function liveFx(code) {
  try {
    const j = await (await fetch(`https://open.er-api.com/v6/latest/${code}`)).json();
    if (j.rates?.KRW) return Math.round(j.rates.KRW * 10000) / 10000;
  } catch { /* 기본값 사용 */ }
  return code === 'JPY' ? 9.3 : 195;
}

function bindNewTripForm(f) {
  const regionsBox = f.querySelector('[data-regions]');
  f.addEventListener('change', (e) => {
    if (e.target.name !== 'country') return;
    regionsBox.innerHTML = regionsOf(e.target.value).map((r, i) => `<label><input type="checkbox" name="region" value="${r.id}" ${i === 0 ? 'checked' : ''} /><span>${esc(r.ko)}</span></label>`).join('');
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const country = f.querySelector('input[name=country]:checked').value;
    const regions = [...f.querySelectorAll('input[name=region]:checked')].map((i) => i.value);
    const m1 = f.m1.value.trim();
    const others = f.others.value.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
    const members = [...new Set([m1, ...others])];
    if (!regions.length) return toast('지역을 하나 이상 고르세요.');
    if (!m1) return toast('내 이름을 입력하세요.');
    if (!f.startDate.value || !f.endDate.value) return toast('날짜를 입력하세요.');
    if (f.endDate.value < f.startDate.value) return toast('날짜를 확인하세요.');
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = '만드는 중…';
    const key = newId(20);
    const trip = { country, regions };
    const d = dest(trip);
    const checklist = [...BASE_CHECKLIST, ...d.country.seedChecklist].map(([group, text], i) => ({ group, text, assignee: '공용', checked: false, order: i }));
    try {
      await S.store.createTrip(key, {
        name: f.elements.name.value.trim() || `${d.title} 여행`,
        country, regions,
        startDate: f.startDate.value,
        endDate: f.endDate.value,
        fxRate: await liveFx(d.country.currency.code),
        members,
        joinCode: S.store.mode === 'cloud' ? newCode() : undefined,
        pack: PACK_VERSION, // 상하이 가이드 데이터는 예전 여행 전용
      }, { checklist });
      local.set(`ts:me:${key}`, m1);
      location.hash = `#/t/${key}/map`;
      setTimeout(shareLink, 700);
    } catch (err) {
      console.error(err);
      toast('만들지 못했어요. 인터넷 연결을 확인하세요.');
      btn.disabled = false;
      btn.textContent = '만들기 →';
    }
  });
}

// ───────── 초대 코드 공유 ─────────
/** 예전 여행(초대 코드 전) → 코드 만들며 잠그기. 지금까지 데이터는 그대로 */
export async function convertToInvite() {
  if (S.store.mode !== 'cloud') return toast('서버에 연결됐을 때만 만들 수 있어요.');
  const code = newCode();
  await S.store.setInvite(S.key, code, null, true);
  toast('초대 코드를 만들었어요. 이제 코드가 있어야 들어올 수 있어요.');
}

function shareLink() {
  const t = S.trip;
  const legacy = !t.uids;
  const code = t.joinCode;
  const inviteUrl = code ? `${location.origin}${location.pathname}#/join/${code}` : '';
  const body = S.store.mode !== 'cloud'
    ? '<p class="notice warn">지금은 서버에 연결되지 않아 이 기기에만 저장돼요. 다른 사람과 같이 쓰려면 인터넷 연결 후 다시 열어주세요.</p>'
    : legacy
      ? `<p>이 여행은 아직 <b>링크만 알면 누구나</b> 들어올 수 있어요.</p>
         <p><b>초대 코드를 만들면</b> 코드를 입력한 기기만 들어올 수 있게 잠겨요. 지금까지 넣은 장소·일정·지출은 그대로예요.</p>
         <p class="hint">코드를 만든 뒤엔 같이 가는 사람도 <b>코드를 한 번 입력</b>해야 해요. (내 다른 기기도 마찬가지)</p>
         <button type="button" class="btn primary big" id="makeCode">초대 코드 만들기</button>`
      : `<div class="invite-code"><small>초대 코드</small><b id="codeText">${esc(fmtCode(code) || '없음')}</b></div>
         <div class="btn-row">
           <button type="button" class="btn primary" id="copyInvite">초대 링크 복사</button>
           ${navigator.share ? '<button type="button" class="btn" id="nativeShare">공유하기</button>' : ''}
           <button type="button" class="btn ghost" id="copyCode">코드만 복사</button>
         </div>
         <p class="hint">링크를 열거나 첫 화면에서 코드를 입력하면 참가돼요. 같이 가는 사람에게만 보내세요.</p>
         <p class="hint">코드가 새어 나갔으면 <button type="button" class="linklike" id="renewCode">새 코드로 바꾸기</button> — 이미 참가한 사람은 그대로예요.</p>`;
  openModal('초대하기', `${body}
    <p class="hint">휴대폰에서 <b>공유 → 홈 화면에 추가</b>하면 앱처럼 바로 열 수 있어요.</p>`, (el) => {
    const copy = async (text) => {
      try { await navigator.clipboard.writeText(text); toast('복사했어요.'); }
      catch { prompt('복사해서 보내세요', text); }
    };
    el.querySelector('#makeCode')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      try { await convertToInvite(); closeModal(); setTimeout(shareLink, 400); }
      catch (err) { console.error(err); toast('만들지 못했어요.'); e.target.disabled = false; }
    });
    el.querySelector('#copyInvite')?.addEventListener('click', () => copy(`${t.name} 초대 링크\n${inviteUrl}\n(초대 코드 ${fmtCode(code)})`));
    el.querySelector('#copyCode')?.addEventListener('click', () => copy(fmtCode(code)));
    el.querySelector('#nativeShare')?.addEventListener('click', () => navigator.share({ title: t.name, text: `초대 코드 ${fmtCode(code)}`, url: inviteUrl }).catch(() => {}));
    el.querySelector('#renewCode')?.addEventListener('click', async () => {
      if (!confirm('새 코드로 바꿀까요? 예전 코드로는 더 이상 참가할 수 없어요.')) return;
      const c = newCode();
      await S.store.setInvite(S.key, c, code, false);
      closeModal();
      setTimeout(shareLink, 400);
    });
  });
}

// ───────── 시작 ─────────
async function boot() {
  $('shareBtn').addEventListener('click', shareLink);
  $('whoBtn').addEventListener('click', askWho);
  window.addEventListener('hashchange', route);
  window.addEventListener('trip:deleting', (e) => {
    const key = e.detail;
    unsubs.forEach((u) => u());
    unsubs = [];
    S.key = null;
    S.trip = null;
    forgetTrip(key);
    closeModal();
    if (location.hash === '#/home') route();
    else location.hash = '#/home';
  });

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

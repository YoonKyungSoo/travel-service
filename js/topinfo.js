// 상단 정보: 여행지(첫 번째 지역) 오늘 날씨 + 실시간 환율 계산기 (현지 통화 → 원)
// 모바일: 화면 위 바 / PC: 왼쪽 메뉴 안
import { S, local } from './state.js';
import { esc, fmtDate, dateRange, toast } from './util.js';
import { openModal, closeModal } from './ui.js';
import { dest, localToday } from './dest.js';

const wxUrl = (r) => `https://api.open-meteo.com/v1/forecast?latitude=${r.center[0]}&longitude=${r.center[1]}`
  + '&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
  + '&timezone=auto&forecast_days=16';
const FX_SOURCES = [
  async (code) => { // 매일 갱신 (여러 은행 평균)
    const j = await (await fetch(`https://open.er-api.com/v6/latest/${code}`)).json();
    if (j.result !== 'success' || !j.rates?.KRW) throw new Error('er-api');
    return { rate: j.rates.KRW, date: new Date(j.time_last_update_unix * 1000).toISOString().slice(0, 10), src: 'ExchangeRate-API' };
  },
  async (code) => { // 유럽중앙은행 기준
    const j = await (await fetch(`https://api.frankfurter.app/latest?from=${code}&to=KRW`)).json();
    if (!j.rates?.KRW) throw new Error('frankfurter');
    return { rate: j.rates.KRW, date: j.date, src: 'ECB' };
  },
];
const WX_TTL = 30 * 60e3, FX_TTL = 60 * 60e3;

// 날씨 코드 → 아이콘·이름 (WMO)
function wxKind(code) {
  if (code === 0) return ['w-sun', '맑음'];
  if (code <= 2) return ['w-psun', '구름 조금'];
  if (code === 3) return ['w-cloud', '흐림'];
  if (code === 45 || code === 48) return ['w-fog', '안개'];
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ['w-snow', '눈'];
  if (code >= 95) return ['w-rain', '뇌우'];
  return ['w-rain', '비'];
}

const readCache = (k) => { try { return JSON.parse(local.get(k) || 'null'); } catch { return null; } };
const writeCache = (k, v) => local.set(k, JSON.stringify({ ...v, t: Date.now() }));

// 지역·통화가 바뀌면 그에 맞는 캐시로 바꿔 끼움
const wxKey = () => `ts:wx:${dest().primary.id}`;
const fxKey = () => `ts:fx:${dest().country.currency.code}`;
let wx = null, wxFor = '';
let fx = null, fxFor = '';
let el = null;
function syncCache() {
  if (wxFor !== wxKey()) { wxFor = wxKey(); wx = readCache(wxFor); }
  if (fxFor !== fxKey()) { fxFor = fxKey(); fx = readCache(fxFor); }
}

async function loadWeather(force) {
  syncCache();
  if (!force && wx && Date.now() - wx.t < WX_TTL) return;
  const key = wxFor;
  try {
    const j = await (await fetch(wxUrl(dest().primary))).json();
    const v = { current: j.current, daily: j.daily };
    writeCache(key, v);
    if (key === wxFor) wx = { ...v, t: Date.now() };
  } catch { /* 이전 값 유지 */ }
}
async function loadRate(force) {
  syncCache();
  if (!force && fx && Date.now() - fx.t < FX_TTL) return;
  const key = fxFor, code = dest().country.currency.code;
  for (const src of FX_SOURCES) {
    try {
      const v = await src(code);
      writeCache(key, v);
      if (key === fxFor) fx = { ...v, t: Date.now() };
      return;
    } catch { /* 다음 출처 */ }
  }
}

/** 지금 쓸 환율: 현지 통화 1단위 = ?원 (실시간 → 마지막 저장값 → 여행 설정값) */
export const liveRate = () => fx?.rate || S.trip?.fxRate || 1;
const fmtRate = (r) => (Math.round(r * 100) / 100).toLocaleString('ko-KR', { maximumFractionDigits: 2 });

function dayWx(date) {
  const d = wx?.daily;
  const i = d?.time?.indexOf(date) ?? -1;
  if (i < 0) return null;
  return { code: d.weather_code[i], max: Math.round(d.temperature_2m_max[i]), min: Math.round(d.temperature_2m_min[i]), rain: d.precipitation_probability_max[i] };
}

function paint() {
  if (!el) return;
  syncCache();
  const cur = dest().country.currency;
  const today = dayWx(localToday());
  const now = wx?.current;
  const [ico, label] = wxKind(now?.weather_code ?? today?.code ?? 3);
  el.innerHTML = `
    <button type="button" class="ti-btn" data-wx title="${esc(dest().primary.ko)} 날씨">
      <svg class="i wx"><use href="#${ico}"/></svg>
      ${now ? `<b>${Math.round(now.temperature_2m)}°</b>` : '<b>—</b>'}
      <span class="ti-sub">${today ? `${today.min}° / ${today.max}°${today.rain >= 30 ? ` · 비 ${today.rain}%` : ` · ${label}`}` : `${esc(dest().primary.ko)} 날씨`}</span>
    </button>
    <button type="button" class="ti-btn" data-fx title="환율 계산기">
      <span class="ti-cny">${cur.sym}${cur.unit}</span>
      <b>${fmtRate(liveRate() * cur.unit)}원</b>
      <svg class="i ti-swap"><use href="#i-swap"/></svg>
    </button>
    <span class="ti-warn" id="tiWarn" hidden></span>`;
  paintMode();
}

/** 실시간 공유가 안 될 때만 경고 점 표시 (모바일에서 여행 정보 바가 사라졌으므로) */
export function paintMode() {
  const w = el?.querySelector('#tiWarn');
  if (!w || !S.store) return;
  const mode = S.store.mode;
  w.hidden = mode === 'cloud';
  w.textContent = mode === 'local' ? '이 기기 저장' : '연결 실패';
}

export async function initTopInfo(target) {
  if (el) { // 여행이 바뀌어 지역·통화가 달라졌으면 새로 불러오기
    const changed = wxFor !== wxKey() || fxFor !== fxKey();
    paint();
    if (changed) { await Promise.all([loadWeather(), loadRate()]); paint(); }
    return;
  }
  el = target;
  paint();
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-wx]')) openWeather();
    else if (e.target.closest('[data-fx]')) openCalc();
  });
  await Promise.all([loadWeather(), loadRate()]);
  paint();
  // 켜 둔 채로 있어도 주기적으로 갱신, 다시 화면에 돌아오면 즉시 갱신
  setInterval(async () => { await Promise.all([loadWeather(), loadRate()]); paint(); }, 10 * 60e3);
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    await Promise.all([loadWeather(), loadRate()]);
    paint();
  });
}

// ───────── 날씨: 여행 날짜별 예보 ─────────
function openWeather() {
  const today = localToday();
  const days = S.trip ? dateRange(S.trip.startDate, S.trip.endDate) : [];
  const list = [...new Set([today, ...days])];
  const row = (d) => {
    const w = dayWx(d);
    const tag = d === today ? '<em class="cat-tag">TODAY</em>' : days.includes(d) ? `<em class="cat-tag">D${days.indexOf(d) + 1}</em>` : '';
    if (!w) return `<li class="wx-row muted"><span class="wx-date">${tag}${fmtDate(d)}</span><span class="wx-none">예보 전 (16일 전부터 나와요)</span></li>`;
    const [ico, label] = wxKind(w.code);
    return `<li class="wx-row"><span class="wx-date">${tag}${fmtDate(d)}</span>
      <span class="wx-ico"><svg class="i wx"><use href="#${ico}"/></svg>${label}</span>
      <span class="wx-temp"><b>${w.max}°</b> / ${w.min}°</span>
      <span class="wx-rain ${w.rain >= 50 ? 'hi' : ''}">☂ ${w.rain ?? 0}%</span></li>`;
  };
  openModal(`${dest().primary.ko} 날씨`, `
    <ul class="wx-list">${list.map(row).join('')}</ul>
    <p class="hint">강수확률 50% 이상이면 우산 챙기기.</p>
    <p class="hint">예보: Open-Meteo · ${wx?.t ? new Date(wx.t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) + ' 갱신' : '불러오는 중'}</p>`);
  loadWeather(true).then(() => { paint(); });
}

// ───────── 환율 계산기 ─────────
function openCalc() {
  const rate = () => liveRate();
  const trip = S.trip?.fxRate;
  const cur = dest().country.currency;
  openModal('환율 계산기', `
    <div class="fx-calc">
      <label class="fx-field"><span>${cur.sym} ${cur.ko}</span><input data-cny type="text" inputmode="decimal" placeholder="0" autocomplete="off" /></label>
      <div class="fx-eq">=</div>
      <label class="fx-field"><span>₩ 원</span><input data-krw type="text" inputmode="numeric" placeholder="0" autocomplete="off" /></label>
      <div class="chips fx-quick">${(cur.code === 'JPY' ? [500, 1000, 3000, 5000, 10000] : [10, 30, 50, 100, 200, 500]).map((n) => `<button type="button" class="chip" data-q="${n}">${cur.sym}${n.toLocaleString('ko-KR')}</button>`).join('')}</div>
      <p class="fx-rate" data-rate></p>
      ${trip ? `<button type="button" class="btn ghost wide" data-apply>지출 계산 환율도 이 값으로 바꾸기 <small>(지금 ${cur.sym}${cur.unit} = ${fmtRate(trip * cur.unit)}원)</small></button>` : ''}
    </div>`, (body) => {
    const cny = body.querySelector('[data-cny]');
    const krw = body.querySelector('[data-krw]');
    const num = (s) => Number(String(s).replace(/[^\d.]/g, '')) || 0;
    const fromCny = () => { const n = num(cny.value); krw.value = n ? Math.round(n * rate()).toLocaleString('ko-KR') : ''; };
    const fromKrw = () => { const n = num(krw.value); cny.value = n ? String(Math.round((n / rate()) * 100) / 100) : ''; };
    const showRate = () => {
      body.querySelector('[data-rate]').innerHTML = fx
        ? `${cur.sym}${cur.unit} = <b>${fmtRate(fx.rate * cur.unit)}원</b> · ${esc(fx.date)} 기준 (${esc(fx.src)})`
        : `${cur.sym}${cur.unit} = <b>${fmtRate(rate() * cur.unit)}원</b> · 실시간 환율을 못 불러와서 여행 설정값 사용 중`;
    };
    cny.addEventListener('input', fromCny);
    krw.addEventListener('input', () => { const n = num(krw.value); krw.value = n ? n.toLocaleString('ko-KR') : ''; fromKrw(); });
    body.querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => { cny.value = b.dataset.q; fromCny(); }; });
    body.querySelector('[data-apply]')?.addEventListener('click', async () => {
      await S.store.updateTrip(S.key, { fxRate: Math.round(rate() * 10000) / 10000 });
      toast('지출 환율을 바꿨어요.');
      closeModal();
    });
    showRate();
    setTimeout(() => cny.focus(), 80);
    // 열 때마다 최신 환율로 다시 계산
    loadRate(true).then(() => { showRate(); if (cny.value) fromCny(); paint(); });
  });
}

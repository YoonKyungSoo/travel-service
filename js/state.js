// 전역 상태: 현재 여행 키, 여행 정보, 내 이름, 각 컬렉션 데이터
export const COLLECTIONS = ['places', 'stays', 'transports', 'schedule', 'checklist', 'expenses', 'links'];

export const S = {
  store: null, // store.js
  key: null, // 여행 키 (링크의 비밀번호 역할)
  trip: null,
  me: null, // 이 기기 사용자 이름
  data: Object.fromEntries(COLLECTIONS.map((c) => [c, []])),
};

const subs = new Set();
/** 데이터가 바뀔 때마다 호출될 함수 등록 */
export const onChange = (fn) => subs.add(fn);
export const notify = (what) => subs.forEach((fn) => fn(what));

// 짧게 쓰는 CRUD
export const add = (col, data) => S.store.add(S.key, col, { ...data, createdBy: S.me || undefined });
export const update = (col, id, patch) => S.store.update(S.key, col, id, patch);
export const remove = (col, id) => S.store.remove(S.key, col, id);
export const byId = (col, id) => S.data[col].find((x) => x.id === id);

// 이 기기 저장값 (localStorage가 막힌 환경에서도 죽지 않게)
export const local = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 무시 */ } },
};

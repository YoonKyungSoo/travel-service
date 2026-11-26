// 데이터 저장소
//  · js/config.js에 Firebase 설정이 있으면 → Firestore (실시간 공유 + 오프라인 캐시)
//  · 없으면 → localStorage (이 기기에만 저장)
// 화면 코드는 어느 쪽이든 같은 함수(watch/add/update/remove)를 씁니다.
import { firebaseConfig } from './config.js';
import { newId } from './util.js';

const FB = 'https://www.gstatic.com/firebasejs/12.0.0';

/** Firestore는 undefined 값을 거부하므로 제거 */
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const stripId = ({ id, ...rest }) => rest; // eslint-disable-line no-unused-vars

// ───────────────────── Firestore ─────────────────────
async function createCloudStore() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${FB}/firebase-app.js`),
    import(`${FB}/firebase-auth.js`),
    import(`${FB}/firebase-firestore.js`),
  ]);
  // 로컬 테스트 전용: localhost?emu 로 열면 실제 DB 대신 에뮬레이터(가짜 서버)에 연결
  const EMU = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /[?&]emu\b/.test(location.search);
  const app = initializeApp(EMU ? { ...firebaseConfig, projectId: 'demo-travel' } : firebaseConfig);
  let db;
  try {
    db = F.initializeFirestore(app, {
      localCache: EMU ? F.memoryLocalCache() : F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
    });
  } catch {
    db = F.getFirestore(app); // 사파리 사생활 보호 모드 등 캐시 불가 환경
  }

  // 익명 로그인 (화면에 보이지 않음). 보안 규칙에서 "로그인한 요청만" 허용하기 위함
  const auth = A.getAuth(app);
  if (EMU) { A.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); F.connectFirestoreEmulator(db, '127.0.0.1', 8080); }
  const authReady = new Promise((resolve) => {
    const off = A.onAuthStateChanged(auth, (u) => { if (u) { off(); resolve(); } });
    A.signInAnonymously(auth).catch((e) => console.warn('익명 로그인 실패(오프라인일 수 있음)', e));
  });

  const tripRef = (key) => F.doc(db, 'trips', key);
  const inviteRef = (code) => F.doc(db, 'invites', code);
  const colRef = (key, col) => F.collection(db, 'trips', key, col);
  const docRef = (key, col, id) => F.doc(db, 'trips', key, col, id);

  // 쓰기는 await 하지 않음 → 오프라인에서도 화면에 즉시 반영되고, 연결되면 자동 전송
  const fire = (p) => p.catch((e) => console.error(e));

  return {
    mode: 'cloud',
    ready: () => authReady,
    uid: () => auth.currentUser?.uid,
    /** 여행 읽기. 멤버가 아니면 { denied: true } */
    async getTrip(key) {
      await authReady;
      try {
        const s = await F.getDoc(tripRef(key));
        return s.exists() ? s.data() : null;
      } catch (e) {
        if (e.code === 'permission-denied') return { denied: true };
        console.error(e);
        return null;
      }
    },
    /** 초대 코드 → 여행 키 (없으면 null) */
    async lookupInvite(code) {
      await authReady;
      try {
        const s = await F.getDoc(inviteRef(code));
        return s.exists() ? s.data().trip : null;
      } catch (e) {
        console.error(e);
        return null;
      }
    },
    /** 초대 코드로 참가: 내 기기를 멤버로 등록 (+ 새 이름이면 이름도 추가) */
    async joinTrip(key, code, name) {
      await authReady;
      const patch = { uids: F.arrayUnion(auth.currentUser.uid), joinTry: code };
      if (name) patch.members = F.arrayUnion(name);
      await F.updateDoc(tripRef(key), patch);
    },
    /** 초대 코드 새로 만들기 (예전 코드는 지움). 예전 여행이면 이때 멤버 방식으로 전환 */
    async setInvite(key, code, oldCode, convert) {
      await authReady;
      const batch = F.writeBatch(db);
      const patch = { joinCode: code };
      if (convert) Object.assign(patch, { uids: [auth.currentUser.uid], ownerUid: auth.currentUser.uid });
      batch.update(tripRef(key), patch);
      batch.set(inviteRef(code), { trip: key, createdAt: Date.now() });
      if (oldCode && oldCode !== code) batch.delete(inviteRef(oldCode));
      await batch.commit();
    },
    watchTrip(key, cb, onDenied) {
      let off = () => {}, alive = true;
      authReady.then(() => {
        if (alive) off = F.onSnapshot(tripRef(key), (s) => cb(s.exists() ? s.data() : null), (e) => { if (e.code === 'permission-denied') onDenied?.(); else console.error(e); cb(null); });
      });
      return () => { alive = false; off(); };
    },
    async createTrip(key, trip, seed) {
      await authReady;
      const batch = F.writeBatch(db);
      const uid = auth.currentUser.uid;
      batch.set(tripRef(key), clean({ ...trip, uids: [uid], ownerUid: uid, createdAt: Date.now() }));
      if (trip.joinCode) batch.set(inviteRef(trip.joinCode), { trip: key, createdAt: Date.now() });
      for (const [col, items] of Object.entries(seed || {})) {
        for (const it of items) batch.set(docRef(key, col, newId(12)), clean({ ...it, createdAt: Date.now() }));
      }
      await batch.commit();
    },
    async updateTrip(key, patch) {
      await authReady;
      fire(F.updateDoc(tripRef(key), clean(patch)));
    },
    watch(key, col, cb, onDenied) {
      let off = () => {}, alive = true;
      authReady.then(() => {
        if (alive) off = F.onSnapshot(colRef(key, col), (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id }))), (e) => { if (e.code === 'permission-denied') onDenied?.(); else console.error(col, e); });
      });
      return () => { alive = false; off(); };
    },
    async add(key, col, data) {
      await authReady;
      const id = newId(12);
      fire(F.setDoc(docRef(key, col, id), clean({ ...stripId(data), createdAt: Date.now() })));
      return id;
    },
    async update(key, col, id, patch) {
      await authReady;
      // 비운 칸(undefined)은 서버에서도 지우기
      const data = Object.fromEntries(Object.entries({ ...stripId(patch), updatedAt: Date.now() }).map(([k, v]) => [k, v === undefined ? F.deleteField() : v]));
      fire(F.updateDoc(docRef(key, col, id), data));
    },
    async remove(key, col, id) {
      await authReady;
      fire(F.deleteDoc(docRef(key, col, id)));
    },
    /** 고정 ID 문서 여러 개를 한 번에 쓰기 (추천 데이터 불러오기용). {컬렉션: [{id, ...}]} */
    async putMany(key, byCol) {
      await authReady;
      const all = Object.entries(byCol).flatMap(([col, items]) => items.map((it) => [col, it]));
      for (let i = 0; i < all.length; i += 400) { // 배치 한도 500
        const batch = F.writeBatch(db);
        for (const [col, it] of all.slice(i, i + 400)) batch.set(docRef(key, col, it.id), clean({ ...stripId(it), createdAt: Date.now() }), { merge: true });
        await batch.commit();
      }
    },
  };
}

// ───────────────────── localStorage ─────────────────────
function createLocalStore() {
  const listeners = new Map();
  const k = (key, col) => `ts:${key}${col ? ':' + col : ''}`;
  const read = (kk, fb) => {
    try { const v = localStorage.getItem(kk); return v ? JSON.parse(v) : fb; } catch { return fb; }
  };
  const emit = (kk) => listeners.get(kk)?.forEach((fn) => fn());
  const write = (kk, v) => {
    try { localStorage.setItem(kk, JSON.stringify(v)); } catch (e) { console.error(e); }
    emit(kk);
  };
  const on = (kk, fn) => {
    if (!listeners.has(kk)) listeners.set(kk, new Set());
    listeners.get(kk).add(fn);
    return () => listeners.get(kk)?.delete(fn);
  };
  window.addEventListener('storage', (e) => e.key && emit(e.key)); // 다른 탭 변경 반영

  return {
    mode: 'local',
    ready: async () => {},
    uid: () => 'local',
    getTrip: async (key) => read(k(key), null),
    lookupInvite: async () => null,
    joinTrip: async () => {},
    setInvite: async (key, code) => write(k(key), { ...read(k(key), {}), joinCode: code }),
    watchTrip(key, cb) {
      const fire = () => cb(read(k(key), null));
      fire();
      return on(k(key), fire);
    },
    async createTrip(key, trip, seed) {
      for (const [col, items] of Object.entries(seed || {})) {
        write(k(key, col), items.map((it) => ({ ...it, id: newId(12), createdAt: Date.now() })));
      }
      write(k(key), { ...trip, createdAt: Date.now() });
    },
    async updateTrip(key, patch) {
      write(k(key), { ...read(k(key), {}), ...patch });
    },
    watch(key, col, cb) {
      const fire = () => cb(read(k(key, col), []));
      fire();
      return on(k(key, col), fire);
    },
    async add(key, col, data) {
      const id = newId(12);
      write(k(key, col), [...read(k(key, col), []), { ...stripId(data), id, createdAt: Date.now() }]);
      return id;
    },
    async update(key, col, id, patch) {
      write(k(key, col), read(k(key, col), []).map((x) => (x.id === id ? { ...x, ...stripId(patch), updatedAt: Date.now() } : x)));
    },
    async remove(key, col, id) {
      write(k(key, col), read(k(key, col), []).filter((x) => x.id !== id));
    },
    async putMany(key, byCol) {
      for (const [col, items] of Object.entries(byCol)) {
        const cur = read(k(key, col), []);
        const ids = new Set(items.map((it) => it.id));
        write(k(key, col), [...cur.filter((x) => !ids.has(x.id)), ...items.map((it) => ({ ...it, createdAt: Date.now() }))]);
      }
    },
  };
}

export const hasFirebase = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

export async function createStore() {
  if (!hasFirebase) return createLocalStore();
  try {
    return await createCloudStore();
  } catch (e) {
    // Firebase 스크립트를 못 받은 경우 (중국 현지 와이파이 등)
    console.error('Firebase 로드 실패 → 이 기기 저장으로 동작', e);
    const s = createLocalStore();
    s.mode = 'local-fallback';
    return s;
  }
}

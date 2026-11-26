// 지역별 구 경계 데이터 만들기 → data/geo/<지역>.geojson
// 실행: node tools/build-geo.mjs   (인터넷 필요. 사이트는 만들어진 파일만 씀)
//
// 출처
//  · 중국: 알리바바 DataV.GeoAtlas (GCJ-02 좌표, 고덕 지도와 일치) https://datav.aliyun.com/portal/school/atlas/area_selector
//  · 일본: 国土数値情報（行政区域データ）를 SmartNews MRI가 경량화한 데이터 (WGS 좌표)
//          https://github.com/smartnews-smri/japan-topography  출처 표기: 「国土数値情報（行政区域データ）」（国土交通省）を加工
//
// 출력 형식 (모든 지역 공통): Feature.properties = { code, name(현지), ko(한국어), centroid:[경도,위도] }
import fs from 'node:fs';

const OUT = new URL('../data/geo/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });

// ───── 한국어 표기 (없으면 현지 이름 그대로 표시) ─────
const KO = {
  // 중국
  东城区: '둥청구', 西城区: '시청구', 朝阳区: '차오양구', 丰台区: '펑타이구', 石景山区: '스징산구', 海淀区: '하이뎬구', 门头沟区: '먼터우거우구',
  房山区: '팡산구', 通州区: '퉁저우구', 顺义区: '순이구', 昌平区: '창핑구', 大兴区: '다싱구', 怀柔区: '화이러우구', 平谷区: '핑구구', 密云区: '미윈구', 延庆区: '옌칭구',
  市南区: '스난구', 市北区: '스베이구', 黄岛区: '황다오구', 崂山区: '라오산구', 李沧区: '리창구', 城阳区: '청양구', 即墨区: '지모구', 胶州市: '자오저우시', 平度市: '핑두시', 莱西市: '라이시시',
  上城区: '상청구', 拱墅区: '궁수구', 西湖区: '시후구', 滨江区: '빈장구', 萧山区: '샤오산구', 余杭区: '위항구', 临平区: '린핑구', 钱塘区: '첸탕구', 富阳区: '푸양구', 临安区: '린안구',
  姑苏区: '구쑤구', 虎丘区: '후추구', 吴中区: '우중구', 相城区: '샹청구', 吴江区: '우장구', 常熟市: '창수시', 张家港市: '장자강시', 昆山市: '쿤산시', 太仓市: '타이창시',
  越秀区: '웨슈구', 荔湾区: '리완구', 海珠区: '하이주구', 天河区: '톈허구', 白云区: '바이윈구', 番禺区: '판위구', 花都区: '화두구', 南沙区: '난사구', 从化区: '충화구', 增城区: '쩡청구',
  福田区: '푸톈구', 罗湖区: '뤄후구', 南山区: '난산구', 盐田区: '옌톈구', 宝安区: '바오안구', 龙岗区: '룽강구', 龙华区: '룽화구', 坪山区: '핑산구', 光明区: '광밍구',
  锦江区: '진장구', 青羊区: '칭양구', 金牛区: '진뉴구', 武侯区: '우허우구', 成华区: '청화구', 龙泉驿区: '룽취안이구', 青白江区: '칭바이장구', 新都区: '신두구', 温江区: '원장구', 双流区: '솽류구', 郫都区: '피두구', 新津区: '신진구', 都江堰市: '두장옌시',
  渝中区: '위중구', 江北区: '장베이구', 南岸区: '난안구', 九龙坡区: '주룽포구', 沙坪坝区: '사핑바구', 大渡口区: '다두커우구', 渝北区: '위베이구', 巴南区: '바난구', 北碚区: '베이베이구',
  新城区: '신청구', 碑林区: '베이린구', 莲湖区: '롄후구', 雁塔区: '옌타구', 未央区: '웨이양구', 灞桥区: '바차오구', 长安区: '창안구', 临潼区: '린퉁구', 阎良区: '옌량구', 高陵区: '가오링구', 鄠邑区: '후이구',
  思明区: '쓰밍구', 湖里区: '후리구', 集美区: '지메이구', 海沧区: '하이창구', 同安区: '퉁안구', 翔安区: '샹안구',
  中山区: '중산구', 西岗区: '시강구', 沙河口区: '사허커우구', 甘井子区: '간징쯔구', 旅顺口区: '뤼순커우구', 金州区: '진저우구', 普兰店区: '푸란뎬구',
  黄埔区: '황푸구', 金堂县: '진탕현', 大邑县: '다이현', 蒲江县: '푸장현', 彭州市: '펑저우시', 邛崃市: '충라이시', 崇州市: '충저우시', 简阳市: '젠양시', 蓝田县: '란톈현', 周至县: '저우즈현',
  道里区: '다오리구', 南岗区: '난강구', 道外区: '다오와이구', 香坊区: '샹팡구', 平房区: '핑팡구', 松北区: '쑹베이구', 呼兰区: '후란구', 阿城区: '아청구', 双城区: '솽청구',
};
// 일본은 같은 이름의 구가 도시마다 있어서(中央区·北区…) 이름만으로 충분 (구 코드로 구분)
const KO_JA = {
  千代田区: '지요다구', 中央区: '주오구', 港区: '미나토구', 新宿区: '신주쿠구', 文京区: '분쿄구', 台東区: '다이토구', 墨田区: '스미다구', 江東区: '고토구', 品川区: '시나가와구',
  目黒区: '메구로구', 大田区: '오타구', 世田谷区: '세타가야구', 渋谷区: '시부야구', 中野区: '나카노구', 杉並区: '스기나미구', 豊島区: '도시마구', 北区: '기타구', 荒川区: '아라카와구',
  板橋区: '이타바시구', 練馬区: '네리마구', 足立区: '아다치구', 葛飾区: '가쓰시카구', 江戸川区: '에도가와구', 武蔵野市: '무사시노시', 三鷹市: '미타카시', 浦安市: '우라야스시',
  都島区: '미야코지마구', 福島区: '후쿠시마구', 此花区: '고노하나구', 西区: '니시구', 大正区: '다이쇼구', 天王寺区: '덴노지구', 浪速区: '나니와구', 西淀川区: '니시요도가와구',
  東淀川区: '히가시요도가와구', 東成区: '히가시나리구', 生野区: '이쿠노구', 旭区: '아사히구', 城東区: '조토구', 阿倍野区: '아베노구', 住吉区: '스미요시구', 東住吉区: '히가시스미요시구',
  西成区: '니시나리구', 淀川区: '요도가와구', 鶴見区: '쓰루미구', 住之江区: '스미노에구', 平野区: '히라노구',
  上京区: '가미교구', 左京区: '사쿄구', 中京区: '나카교구', 東山区: '히가시야마구', 下京区: '시모교구', 南区: '미나미구', 右京区: '우쿄구', 伏見区: '후시미구', 山科区: '야마시나구', 西京区: '니시쿄구',
  奈良市: '나라시',
  東灘区: '히가시나다구', 灘区: '나다구', 兵庫区: '효고구', 長田区: '나가타구', 須磨区: '스마구', 垂水区: '다루미구',
  東区: '히가시구', 博多区: '하카타구', 城南区: '조난구', 早良区: '사와라구',
  白石区: '시로이시구', 豊平区: '도요히라구', 厚別区: '아쓰베쓰구', 手稲区: '데이네구', 清田区: '기요타구', 小樽市: '오타루시',
  千種区: '지쿠사구', 中村区: '나카무라구', 中区: '나카구', 昭和区: '쇼와구', 瑞穂区: '미즈호구', 熱田区: '아쓰타구', 中川区: '나카가와구', 守山区: '모리야마구', 緑区: '미도리구', 名東区: '메이토구', 天白区: '덴파쿠구',
  那覇市: '나하시', 浦添市: '우라소에시', 宜野湾市: '기노완시', 北谷町: '차탄초', 恩納村: '온나손', 名護市: '나고시', 本部町: '모토부초', 沖縄市: '오키나와시', 読谷村: '요미탄손',
  豊見城市: '도미구스쿠시', 糸満市: '이토만시', 南城市: '난조시', 今帰仁村: '나키진손', 伊江村: '이에손', 国頭村: '구니가미손', うるま市: '우루마시', 西原町: '니시하라초', 与那原町: '요나바루초', 南風原町: '하에바루초', 八重瀬町: '야에세초', 嘉手納町: '가데나초', 金武町: '긴초', 宜野座村: '기노자손', 大宜味村: '오기미손', 東村: '히가시손', 北中城村: '기타나카구스쿠손', 中城村: '나카구스쿠손',
};

// ───── 지역 정의 ─────
// 중국: DataV 도시 코드, 지역 범위(bbox: 남,서,북,동) 안에 중심이 있는 구만
const CN = {
  beijing: [110000, [39.4, 115.4, 41.1, 117.5]], qingdao: [370200, [35.6, 119.5, 36.9, 121.0]], hangzhou: [330100, [29.9, 119.6, 30.6, 120.7]],
  suzhou: [320500, [30.75, 119.9, 32.05, 121.35]], guangzhou: [440100, [22.5, 112.9, 23.95, 114.05]], shenzhen: [440300, [22.4, 113.7, 22.9, 114.65]],
  chengdu: [510100, [30.1, 102.9, 31.45, 104.9]], chongqing: [500000, [29.2, 106.2, 29.95, 107.0]], xian: [610100, [33.7, 107.6, 34.75, 109.8]],
  xiamen: [350200, [24.35, 117.85, 24.9, 118.45]], dalian: [210200, [38.7, 121.1, 39.4, 122.2]], harbin: [230100, [45.5, 126.2, 46.1, 127.0]],
};
// 일본: [도도부현 번호, 넣을 시구정촌 코드 목록 | bbox]
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i).padStart(5, '0'));
const JP = {
  tokyo: [[13, [...range(13101, 13123), '13203', '13204']], [12, ['12227']]], // 23구 + 무사시노·미타카 + 우라야스(디즈니)
  osaka: [[27, range(27102, 27128)]],
  kyoto: [[26, range(26101, 26111)]],
  nara: [[29, ['29201']]],
  kobe: [[28, range(28101, 28111)]],
  fukuoka: [[40, range(40131, 40137)]],
  sapporo: [[1, [...range(1101, 1110), '01203']]],
  nagoya: [[23, range(23101, 23116)]],
  okinawa: [[47, [26.05, 127.6, 26.9, 128.35]]], // 오키나와 본섬 중남부·북부 (범위로)
};

const round = (c) => (typeof c[0] === 'number' ? [+c[0].toFixed(5), +c[1].toFixed(5)] : c.map(round));
/** 가장 큰 고리의 면적 중심 (라벨 위치) */
function centroidOf(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let best = null, bestA = 0;
  for (const p of polys) {
    const r = p[0];
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
      a += f; cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f;
    }
    if (Math.abs(a) > bestA) { bestA = Math.abs(a); best = [cx / (3 * a), cy / (3 * a)]; }
  }
  return best.map((v) => +v.toFixed(5));
}
const inBox = ([lng, lat], [s, w, n, e]) => lat >= s && lat <= n && lng >= w && lng <= e;
const getJson = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); };
const save = (id, features) => {
  fs.writeFileSync(new URL(`${id}.geojson`, OUT), JSON.stringify({ type: 'FeatureCollection', features }));
  const miss = features.filter((f) => f.properties.ko === f.properties.name).map((f) => f.properties.name);
  console.log(`${id}: 구 ${features.length}개, ${(fs.statSync(new URL(`${id}.geojson`, OUT)).size / 1024).toFixed(0)}KB${miss.length ? ` · 한국어 없음: ${miss.join(' ')}` : ''}`);
};

for (const [id, [adcode, box]] of Object.entries(CN)) {
  const g = await getJson(`https://geo.datav.aliyun.com/areas_v3/bound/${adcode}_full.json`);
  const features = g.features.filter((f) => inBox(f.properties.centroid || f.properties.center, box)).map((f) => ({
    type: 'Feature',
    properties: { code: String(f.properties.adcode), name: f.properties.name, ko: KO[f.properties.name] || f.properties.name, centroid: (f.properties.centroid || f.properties.center).map((v) => +v.toFixed(5)) },
    geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) },
  }));
  save(id, features);
}

const prefCache = {};
for (const [id, parts] of Object.entries(JP)) {
  const byCode = new Map();
  for (const [pref, pick] of parts) {
    const pp = String(pref).padStart(2, '0');
    prefCache[pp] ||= await getJson(`https://raw.githubusercontent.com/smartnews-smri/japan-topography/main/data/municipality/geojson/s0010/N03-21_${pp}_210101.json`);
    for (const f of prefCache[pp].features) {
      const code = f.properties.N03_007;
      if (!code || !f.geometry) continue;
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      if (Array.isArray(pick) && typeof pick[0] === 'string' ? !pick.includes(code) : !inBox(centroidOf(f.geometry), pick)) continue;
      // 같은 구가 여러 조각(섬 등)으로 나뉘어 있으면 하나로 합침
      const cur = byCode.get(code) || { name: f.properties.N03_004 || f.properties.N03_003, polys: [] };
      cur.polys.push(...polys);
      byCode.set(code, cur);
    }
  }
  const features = [...byCode].map(([code, { name, polys }]) => {
    const geometry = polys.length === 1 ? { type: 'Polygon', coordinates: round(polys[0]) } : { type: 'MultiPolygon', coordinates: round(polys) };
    return { type: 'Feature', properties: { code, name, ko: KO_JA[name] || name, centroid: centroidOf(geometry) }, geometry };
  });
  save(id, features);
}

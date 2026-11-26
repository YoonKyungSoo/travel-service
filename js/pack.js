// 추천 데이터 묶음 (상하이 여행 가이드 PDF 정리본)
// 여행 링크를 처음 열 때 한 번 DB에 자동으로 들어갑니다. (trip.pack 버전으로 중복 방지)
// 문서 ID가 고정이라 두 사람이 동시에 열어도 같은 문서에 덮어써질 뿐 중복되지 않습니다.
import { wgs2gcj } from './util.js';

export const PACK_VERSION = 8;

// 좌표는 WGS-84(OpenStreetMap 기준) → 불러올 때 GCJ-02로 변환
// approx: 정확한 지점이 아니라 대표 위치 (체인점 등)
// lat 없음: 지점이 많은 체인·배달 → 핀 없이 목록에만 ("어디서나")
// wish: 우리가 꼭 먹고/하고 싶은 곳 (목록 맨 위 · ★ 표시)
const P = (id, o) => ({ id: `pk_${id}`, ...o });

const RAW_PLACES = [
  // ───── 관광지 ─────
  P('bund', { name: '와이탄 (The Bund)', nameZh: '外滩', addressZh: '上海市黄浦区中山东一路', category: 'sight', tags: ['야경', '랜드마크', '산책'], howto: '2·10호선 난징둥루역, 도보 약 10분', memo: '강 건너 푸둥 스카이라인이 보이는 상하이 대표 야경 명소.', photo: 'bund-night', wgs: [31.2400, 121.4880], date: '2026-12-10' }),
  P('yuyuan', { name: '예원 · 성황묘', nameZh: '豫园 · 城隍庙', addressZh: '上海市黄浦区福佑路168号', category: 'sight', tags: ['역사·문화', '맛집', '쇼핑', '야경'], howto: '10호선 예원역', memo: '전통 중국 건축, 기념품 상점과 길거리 음식. 밤 조명이 예뻐서 야경 추천.', photo: 'yuyuan', wgs: [31.22893, 121.48798], date: '2026-12-11' }),
  P('xintiandi', { name: '신톈디', nameZh: '新天地', addressZh: '上海市黄浦区太仓路181弄', category: 'sight', tags: ['맛집', '산책', '쇼핑', '브런치'], howto: '10·13호선 신톈디역', memo: '프랑스 조계지 분위기의 석고문 거리. 감성 카페·레스토랑 밀집.', photo: 'xintiandi', wgs: [31.22193, 121.47044], date: '2026-12-11' }),
  P('tianzifang', { name: '톈쯔팡', nameZh: '田子坊', addressZh: '上海市黄浦区泰康路210弄', category: 'sight', tags: ['산책', '쇼핑'], howto: '9호선 다푸차오역', memo: '골목 사이 공방·카페·소품숍. 골목 사진 명소.', photo: 'tianzifang', wgs: [31.21034, 121.46410], date: '2026-12-11' }),
  P('wukang', { name: '우캉루 · 우캉맨션', nameZh: '武康路 · 武康大楼', addressZh: '上海市徐汇区淮海中路1842号', category: 'sight', tags: ['산책', '사진'], howto: '10·11호선 교통대학역', memo: '우캉맨션 앞이 대표 사진 스팟. 유럽풍 건물과 플라타너스 길.', photo: 'wukang', wgs: [31.20626, 121.43373], date: '2026-12-11' }),
  P('pearl', { name: '동방명주', nameZh: '东方明珠广播电视塔', addressZh: '上海市浦东新区世纪大道1号', category: 'sight', tags: ['랜드마크', '야경'], howto: '2호선 루자쭈이역, 도보 5분', photo: 'oriental-pearl', wgs: [31.24195, 121.49526] }),
  P('shtower', { name: '상하이 타워 · 루자쭈이', nameZh: '上海中心大厦', addressZh: '上海市浦东新区银城中路501号', category: 'sight', tags: ['야경', '랜드마크'], howto: '2호선 루자쭈이역', memo: '국제금융센터(SWFC)·진마오타워가 바로 옆. 초고층 빌딩 세 개가 모인 루자쭈이 핵심.', photo: 'shanghai-tower', wgs: [31.23565, 121.50125] }),
  P('disney', { name: '상하이 디즈니랜드', nameZh: '上海迪士尼乐园', addressZh: '上海市浦东新区川沙新镇黄赵路310号', category: 'sight', tags: ['테마파크'], howto: '11호선 디즈니랜드역', memo: '추천 루트: 오후 입장. 입장권은 미리 구매.', photo: 'disney', wgs: [31.14625, 121.65628], date: '2026-12-12' }),
  P('zhujiajiao', { name: '주자자오 수향마을', nameZh: '朱家角古镇', addressZh: '上海市青浦区朱家角镇', category: 'sight', tags: ['역사·문화', '산책'], howto: '17호선 주자자오역 (시내에서 약 1시간)', wgs: [31.11635, 121.04921] }),
  P('peoplesq', { name: '인민광장', nameZh: '人民广场', addressZh: '上海市黄浦区人民大道', category: 'sight', tags: ['랜드마크'], howto: '1·2·8호선 인민광장역', photo: 'peoples-square', wgs: [31.23389, 121.47099] }),
  P('jingansi', { name: '정안사 (징안쓰)', nameZh: '静安寺', addressZh: '上海市静安区南京西路1686号', category: 'sight', tags: ['역사·문화'], howto: '2·7호선 징안쓰역', wgs: [31.22521, 121.44079] }),

  // ───── 액티비티 ─────
  P('nanjingroad', { name: '난징둥루 보행가', nameZh: '南京东路步行街', addressZh: '上海市黄浦区南京东路步行街', category: 'activity', tags: ['쇼핑', '산책'], howto: '2·10호선 난징둥루역', photo: 'nanjing-road', wgs: [31.23768, 121.47530], date: '2026-12-10' }),
  P('captain', { name: '와이탄 루프탑 바 (The Captain)', nameZh: '船长青年酒店 酒吧', addressZh: '上海市黄浦区福州路37号', category: 'activity', tags: ['술·바', '야경'], howto: '와이탄 일대, 2·10호선 난징둥루역', memo: '와이탄 루프탑 바 대표 예시. 주변에 다른 루프탑 바도 많아요.', wgs: [31.2374, 121.4868], approx: true }),
  P('cruise', { name: '황푸강 야경 유람선', nameZh: '黄浦江游览 十六铺码头', addressZh: '上海市黄浦区中山东二路531号', category: 'activity', tags: ['야경', '유람선'], howto: '와이탄 남쪽 스류푸 선착장', memo: '마지막 배 시간은 현장에서 확인.', wgs: [31.23059, 121.49378], date: '2026-12-10' }),
  P('kpg', { name: '대한민국 임시정부 청사', nameZh: '大韩民国临时政府旧址', addressZh: '上海市黄浦区马当路306弄4号', category: 'activity', tags: ['역사·문화'], howto: '신톈디에서 도보', memo: '운영시간·휴관일은 미리 확인.', wgs: [31.21922, 121.47016], date: '2026-12-11' }),
  P('era', { name: 'ERA 상하이 서커스', nameZh: '时空之旅 上海马戏城', addressZh: '上海市静安区共和新路2266号', category: 'activity', tags: ['체험·공연'], howto: '1호선 상하이마시청역', memo: '공연 예약 필요.', wgs: [31.28180, 121.44730] }),
  P('superbrand', { name: '정대광장', nameZh: '正大广场', addressZh: '上海市浦东新区陆家嘴西路168号', category: 'shop', tags: ['쇼핑', '맛집'], howto: '2호선 루자쭈이역', memo: '추천 루트: 점심.', wgs: [31.23865, 121.49474], date: '2026-12-12' }),
  P('ifc', { name: 'IFC 몰', nameZh: '上海国金中心商场', addressZh: '上海市浦东新区世纪大道8号', category: 'shop', tags: ['쇼핑'], howto: '2호선 루자쭈이역 직결', wgs: [31.2368, 121.4985] }),
  P('roastery', { name: '스타벅스 리저브 로스터리', nameZh: '星巴克臻选上海烘焙工坊', addressZh: '上海市静安区南京西路789号 兴业太古汇', category: 'cafe', tags: ['카페', '난징시루'], howto: '2·12·13호선 난징시루역', wgs: [31.23098, 121.45852] }),

  // ───── 먹거리 ─────
  P('nanxiang', { name: '난상만두점 (샤오룽바오)', nameZh: '南翔馒头店', addressZh: '上海市黄浦区豫园路85号', category: 'food', tags: ['현지음식', '샤오룽바오'], howto: '예원 안', wgs: [31.22853, 121.48710], date: '2026-12-11' }),
  P('xiaoyang', { name: '샹젠바오 · 소양생전 황허루점', nameZh: '小杨生煎(黄河路店)', addressZh: '上海市黄浦区黄河路97号', category: 'food', tags: ['현지음식', '체인'], howto: '1·2·8호선 인민광장역, 도보 약 5분', memo: '상하이식 군만두(生煎) 대표 체인. 1인 약 30위안. 지점이 많아서 가까운 곳으로 가도 돼요.', wgs: [31.2367, 121.4693] }),
  P('dahuchun', { name: '다후춘 (생전만두)', nameZh: '大壶春', addressZh: '上海市黄浦区四川中路136号', category: 'food', tags: ['만두'], wgs: [31.23670, 121.48477] }),
  P('ada', { name: '총유빙 (아대총유빙)', nameZh: '阿大葱油饼', addressZh: '上海市黄浦区瑞金二路120弄', category: 'food', tags: ['디저트·간식', '노점'], memo: '유명 노점이라 줄이 길 수 있어요.', wgs: [31.21332, 121.46078] }),
  P('wangbaohe', { name: '상하이 털게 · 왕바오허', nameZh: '王宝和酒家', addressZh: '上海市黄浦区福州路603号', category: 'food', tags: ['현지음식', '12월 제철'], memo: '12월 제철 털게(大闸蟹) 대표 전문점.', wgs: [31.23454, 121.47490] }),
  P('laozhengxing', { name: '홍샤오러우 · 라오정싱', nameZh: '老正兴菜馆', addressZh: '上海市黄浦区福州路556号', category: 'food', tags: ['현지음식', '고기', '본방요리'], memo: '상하이 본방요리(本帮菜) 노포. 홍샤오러우.', wgs: [31.23513, 121.47564] }),
  P('laolao', { name: '그랜드마더 (상하이 가정식)', nameZh: '上海姥姥家常饭馆', addressZh: '上海市黄浦区福州路70号', category: 'food', tags: ['가정식'], memo: '중국식 가정식 · 동파육, 마파두부.', wgs: [31.2373, 121.4856], approx: true }),
  P('haidilao', { name: '하이디라오 훠궈', nameZh: '海底捞火锅', category: 'food', tags: ['훠궈', '고기', '24시간'], howto: '지점이 많고 24시간 지점도 있음', memo: '하이디라오의 나라에서 훠궈는 무조건! 한국의 반 가격, 한국에 없는 메뉴 많음.', photo: 'haidilao', wgs: [31.23915, 121.47922], approx: true, date: '2026-12-12' }),
  P('henjiu', { name: '헌지우이치엔 양꼬치 · 제일백화점점', nameZh: '很久以前羊肉串(南京东路第一百货店)', addressZh: '上海市黄浦区南京东路800号 第一百货', category: 'food', tags: ['양꼬치', '맥주'], howto: '1·2·8호선 인민광장역 / 2·10호선 난징둥루역', memo: '여행 때마다 2번 이상 가는 인생 양꼬치. 부추무침·국수·볶음밥·우유식빵 통집, 맥주는 필수.\n지점 중 줄이 제일 길어요. 위챗 미니프로그램으로 줄서기. 톈쯔팡 日月光점, 동방명주 근처 尚悦湾점도 있어요.', photo: 'henjiu', wgs: [31.2348, 121.4737], wish: true }),
  P('hongkuijia', { name: '홍쿠이지아 마라가재 · 인민광장점', nameZh: '红盔甲(人民广场店)', addressZh: '上海市黄浦区金陵东路500号', category: 'food', tags: ['해산물', '마라가재'], howto: '8·14호선 다스제(大世界)역 근처, 인민광장에서 도보', memo: '대표 메뉴는 마라가재볶음(麻辣小龙虾) — 이거 먹으러 가는 곳! 한국인 입맛 저격, 다 손질해줘서 먹기도 편함.\n지점 중 인기 1위라 웨이팅이 길 수 있어요. 영업 11:00–14:00 · 16:30–02:00 (예전 정보 · 디엔핑에서 확인).', photo: 'hongkuijia', wgs: [31.2306, 121.4779], wish: true }),
  P('laila', { name: '라이라이 샤오룽바오', nameZh: '乔艾莱莱小笼(天津路店)', addressZh: '上海市黄浦区天津路506号', category: 'food', tags: ['샤오룽바오', '미쉐린'], howto: '2·10호선 난징둥루역, 도보 약 5분 (골목 안)', memo: '미쉐린 가이드에 소개된 샤오룽바오 맛집. 웨이팅은 있지만 회전이 빨라요.\n블로그 추천: 게살 샤오룽바오(蟹粉小笼)가 특히 맛있음. 돈까스는 무난.\n현금만 받는다는 정보가 있어요 · 점심에 1시간 쉬는 시간 · 붐비면 합석.', wgs: [31.23626, 121.47699], wish: true }),
  P('dintaifung', { name: '딘타이펑 (신톈디)', nameZh: '鼎泰丰(新天地店)', addressZh: '上海市黄浦区马当路245号 新天地时尚 2楼', category: 'food', tags: ['딤섬'], howto: '10·13호선 신톈디역', memo: '쇼핑몰 新天地时尚(Xintiandi Style) 2층. 위치는 디엔핑에서 한 번 확인.', wgs: [31.2180, 121.4735] }),
  P('redlips', { name: '레드립스 (마라반)', nameZh: '味爱自助百汇', category: 'food', tags: ['마라', '배달 추천'], memo: '매장도 좋지만 배달 추천! 야식으로, 만두도 같이 시키기.', photo: 'redlips' }),
  P('niunew', { name: '우뉴 스키야키', nameZh: '牛New寿喜烧', category: 'food', tags: ['훠궈'] }),
  P('zhuguangyu', { name: '주광옥 훠궈', nameZh: '朱光玉火锅馆', category: 'food', tags: ['훠궈'] }),
  // 우리가 꼭 먹고 싶은 것 (지점이 많아 핀 없이 목록에만 · 디엔핑/고덕에서 가까운 곳 검색)
  P('jianbing', { name: '지엔빙 (젠빙궈쯔)', nameZh: '煎饼果子', category: 'food', tags: ['길거리 간식', '아침'], howto: '아침 노점·골목 가게에서 흔함', memo: '중국식 크레페. 계란 + 바삭한 튀김과자(薄脆)를 넣어 돌돌 말아줘요. 아침으로 딱.\n난징루 근처 노점이 한국인 사이에서 유명해졌다는 기사도 있어요. 디엔핑·샤오홍슈에서 "煎饼果子 南京路" 검색.', wish: true }),
  P('diandude', { name: '점도덕 딤섬 · 정대점', nameZh: '点都德·德小馆(正大店)', addressZh: '上海市浦东新区陆家嘴西路168号 正大广场', category: 'food', tags: ['딤섬', '광둥요리'], howto: '2호선 루자쭈이역 · 정대광장 안 (동방명주 근처)', memo: '대표 메뉴 홍미창펀(红米肠) — 겉은 쫄깃, 한쪽은 바삭. 샤오마이, 차슈바오(달달한 돼지고기 찐빵)도 성공.\n12/12 정대광장 점심 일정에 딱 맞아요. 간이 한국인 입맛에 잘 맞는 편.', wgs: [31.23865, 121.49474], date: '2026-12-12', wish: true }),
  P('xiehuangmian', { name: '게살국수 · 위싱지 와이탄점', nameZh: '裕兴记·蟹黄面馆(外滩店)', addressZh: '上海市黄浦区四川中路410号', category: 'food', tags: ['현지음식', '12월 제철'], howto: '2·10호선 난징둥루역, 난징루 보행가 입구에서 약 50m', memo: '게살·게알을 듬뿍 올려 비벼 먹는 상하이 국수(蟹黄面). 12월 털게 철이라 딱 좋아요. 가격대가 꽤 있는 편.\n근처 다른 곳: 蟹谷面(宁波路202号), 庄氏隆兴 蟹樽面道(南京东路228号 新世界大丸 B2).', wgs: [31.2391, 121.4843], wish: true }),
  P('beijingduck', { name: '베이징덕 · 예상하이 (신톈디)', nameZh: '夜上海', addressZh: '上海市黄浦区湖滨路168号 无限极荟 3楼', category: 'food', tags: ['오리', '저녁', '미쉐린'], howto: '10·13호선 신톈디역, 도보 약 5분 (쇼핑몰 3층)', memo: '베이징덕 하프 사이즈 주문 가능 → 2명이 먹기 딱. 직원이 테이블 앞에서 잘라주고, 캐비어 올린 한입도 나와요.\n마파두부도 같이 시키면 느끼함을 잡아줘요. 12/11 신톈디 일정이랑 묶기 좋음.\n대안: 大董 (淮海中路999号 iapm 6楼, 미쉐린 1스타).', wgs: [31.2181, 121.4728], wish: true }),
  P('feidachu', { name: '페이다추 (꽈리고추 돼지고기볶음)', nameZh: '费大厨辣椒炒肉(悦荟广场店)', addressZh: '上海市黄浦区南京东路 悦荟广场', category: 'food', tags: ['가정식', '밥도둑', '블로그 추천'], howto: '2·10호선 난징둥루역 · 난징둥루 보행가 중간 悦荟广场 안', memo: '대표 메뉴는 꽈리고추 돼지고기볶음(辣椒炒肉). 흰쌀밥이랑 잘 어울리고 향신료 걱정 적음. 밥은 작은 밥솥째 나와요.\n거대한 아이스티 필수. 식으면 짜지니까 뜨거울 때 먹기.', wgs: [31.2372, 121.4790], approx: true, wish: true }),
  P('massage', { name: '마사지 (발·전신)', nameZh: '足疗 · 按摩', category: 'activity', tags: ['마사지', '휴식'], howto: '디엔핑에서 足疗 / 按摩 검색 → 숙소 근처로 예약', memo: '디즈니 다녀온 날 밤에 추천. 디엔핑으로 미리 예약하면 편해요.', wish: true }),

  // ───── 카페 · 디저트 ─────
  P('tanghulu', { name: '탕후루 · 예원 길거리 간식', nameZh: '冰糖葫芦', category: 'cafe', tags: ['디저트·간식'], howto: '예원 · 성황묘 상점가', memo: '길거리에서 많이 보이는데, 노점 말고 매장 같은 곳에서 사 먹어야 해요!', photo: 'tanghulu', wgs: [31.2281, 121.4892], approx: true }),
  P('lillian', { name: '릴리안 베이커리', nameZh: '莉莲蛋挞', addressZh: '上海市静安区南京西路988号 (예: 남경서로점)', category: 'cafe', tags: ['에그타르트', '체인'], howto: '지하철역 안·상가에 지점이 많아요 (쉬자후이역 환승통로 등)', memo: '에그타르트 1개 약 1,500원. 종류가 4개라 취향대로.\n지점이 많아서 가까운 곳으로 가면 돼요.', photo: 'lillian', wgs: [31.23466, 121.46977], approx: true, wish: true }),
  P('holiland', { name: '홀리랜드', nameZh: '好利来', category: 'cafe', tags: ['케이크', '기념품'], memo: '귀여운 케이크부터 유명 디저트까지. 포장이 꼼꼼해 마지막에 사서 한국에 가져가기도 좋아요.', photo: 'holiland', wgs: [31.23925, 121.49570], approx: true }),
  P('heytea', { name: '헤이티', nameZh: '喜茶', category: 'cafe', tags: ['음료'], memo: '1일 1헤이티 필수! 다육포도, 망고 코코넛, 다육포도 코코넛.', photo: 'heytea', wgs: [31.23740, 121.46945], approx: true }),
  P('amashouzuo', { name: '아마수작', nameZh: '阿嬷手作', category: 'cafe', tags: ['음료'], memo: '요즘 많이 뜨는 음료! 웨이팅 길면 위챗으로 주문. 늦게 도착해도 냉장고에 보관해줘서 녹지 않아요.', photo: 'amashouzuo' }),
  P('paopao', { name: 'paopao (케이크)', category: 'cafe', tags: ['케이크'], memo: '케이크 맛집. 귀엽고 작은 케이크 종류가 엄청 많아요. 예쁜 디저트 먹고 싶다면 무조건!', photo: 'paopao' }),
  P('marzo', { name: '13 De Marzo (곰 카페)', category: 'cafe', tags: ['카페', '사진'], memo: '주말엔 웨이팅 엄청 길어서 미리 주문. 커피 주문하면 곰인형도 같이 줘요. 시즌별로 곰 의상이 바뀜.', photo: '13demarzo' }),
  P('baiguoyuan', { name: '백과원 (과일)', nameZh: '百果园', category: 'cafe', tags: ['과일'], memo: '상하이 과일 맛집 체인. 망고까지 다 손질해줘서 먹기 편해요.', photo: 'baiguoyuan' }),
  P('xuemeiniang', { name: '쉐미냥 (찹쌀떡)', category: 'cafe', tags: ['디저트', '배달'], memo: '찹쌀떡 맛집, 배달 가능.' }),
  P('savage', { name: '야인선생 젤라또', nameZh: '野人先生', category: 'cafe', tags: ['젤라또'], memo: '밤 9시 이후 1+1.', wgs: [31.23037, 121.45445], approx: true }),
  P('alimentari', { name: '알리메타리 (브런치)', nameZh: 'Alimentari', addressZh: '上海市徐汇区安福路168号', category: 'cafe', tags: ['브런치'], wgs: [31.21618, 121.44014] }),
  P('butterful', { name: 'Butterful & Creamorous', category: 'cafe', tags: ['베이커리'], memo: '베이커리 맛집.' }),
  P('loam', { name: 'LOAM', category: 'cafe', tags: ['카페'], memo: '넓고 분위기 좋은 카페.' }),
  P('fascino', { name: 'FASCINO BAKERY · 싱푸리점', nameZh: 'FASCINO(幸福里店)', addressZh: '上海市长宁区番禺路381号 幸福里F座1楼', category: 'cafe', tags: ['디저트', '베이커리'], howto: '10·11호선 교통대학역, 도보 약 10분', memo: '디저트 맛집. 신톈디(太仓路181弄)에도 지점 있어요.', wgs: [31.20614, 121.42541] }),
  P('dq', { name: 'DQ (아이스크림)', category: 'cafe', tags: ['아이스크림', '체인'] }),
];

// 이미 들어간 장소를 실제 지점 주소로 고치기 (v3)
export const PACK_REFRESH = ['pk_henjiu', 'pk_hongkuijia', 'pk_diandude', 'pk_xiehuangmian', 'pk_beijingduck', 'pk_jianbing', 'pk_laila', 'pk_xiaoyang', 'pk_dintaifung', 'pk_lillian', 'pk_fascino'];
// 이미 들어간 장소에도 ★ 붙이기 (v2)
export const PACK_WISH = RAW_PLACES.filter((p) => p.wish).map((p) => p.id);

export const PACK_PLACES = RAW_PLACES.map(({ wgs, photo, ...p }) => {
  const out = { ...p, src: 'pack', visited: false };
  if (wgs) [out.lat, out.lng] = wgs2gcj(wgs[0], wgs[1]);
  if (photo) out.photo = `img/places/${photo}.jpg`;
  return out;
});

const bm = wgs2gcj(31.2415, 121.4815);
export const PACK_STAYS = [
  { id: 'pk_stay_bluemountain', name: '블루마운틴 유스호스텔 (와이탄)', nameZh: '蓝山国际青年旅舍', status: 'candidate', checkIn: '2026-12-09', checkOut: '2026-12-13', lat: bm[0], lng: bm[1], memo: '가이드 PDF 지도에 표시된 숙소 · 정확한 위치와 가격은 확인 필요', src: 'pack' },
];

// 추천 루트 → 실제 항공 시간(12/9 22:10 훙차오 도착, 12/13 08:40 푸둥 출발)에 맞춰 조정
const S = (id, date, time, title, placeId, memo) => ({ id: `pk_sch_${id}`, date, time, title, placeId: `pk_${placeId}`, memo, done: false, src: 'pack' });
export const PACK_SCHEDULE = [
  { id: 'pk_sch_d0a', date: '2026-12-09', time: '23:10', title: '훙차오 T1 → 숙소 (디디)', placeId: null, memo: '입국심사·짐 찾고 약 1시간 후. 늦은 시간이라 디디/택시가 편해요.', done: false, src: 'pack' },
  S('d1a', '2026-12-10', '19:30', '난징둥루 구경', 'nanjingroad'),
  S('d1b', '2026-12-10', '20:30', '와이탄 야경', 'bund'),
  S('d1c', '2026-12-10', '21:15', '황푸강 유람선', 'cruise', '마지막 배 시간 확인'),
  S('d2a', '2026-12-11', '10:00', '신톈디 브런치', 'xintiandi'),
  S('d2b', '2026-12-11', '11:30', '대한민국 임시정부 청사', 'kpg'),
  S('d2c', '2026-12-11', '13:30', '톈쯔팡 구경', 'tianzifang'),
  S('d2d', '2026-12-11', '15:30', '우캉맨션 · 우캉루', 'wukang'),
  S('d2e', '2026-12-11', '18:30', '예원 야경', 'yuyuan'),
  S('d2f', '2026-12-11', '19:30', '저녁 · 난상만두점', 'nanxiang'),
  S('d3a', '2026-12-12', '11:00', '정대광장 점심', 'superbrand'),
  S('d3b', '2026-12-12', '13:30', '디즈니랜드 (오후)', 'disney', '루자쭈이 → 디즈니 지하철 약 50분'),
  S('d3c', '2026-12-12', '21:30', '저녁 · 하이디라오', 'haidilao', '24시간 지점 있음'),
];

// 준비물: match 글자가 들어간 항목이 이미 있으면 추가하지 않음
const C = (id, group, text, match, note) => ({ id: `pk_chk_${id}`, group, text, match, note });
export const PACK_CHECKLIST = [
  C('adapter', '전자기기', '멀티어댑터', '어댑터'),
  C('tissue', '기타', '휴지 / 물티슈', '휴지'),
  C('wechat', '앱 설치', '위챗 (WeChat)', '위챗 (', '메시지 + QR 결제 + 미니프로그램. 많은 가게가 위챗 QR 메뉴로 주문해요.'),
  C('dianping', '앱 설치', '따종디엔핑 (Dianping)', '디엔핑', '배달·예약(네일·마사지)을 한 번에, 현지 맛집 확인. 숙소에서 배달은 필수.'),
  C('kakaopay', '앱 설치', '카카오페이 (해외결제)', '카카오페이', '알리페이+ 연동이라 중국 알리페이 가맹점 대부분에서 사용 가능. 200위안 이상 결제 시 약 3% 해외결제 수수료 면제.'),
  C('vpn', '앱 설치', 'VPN 앱 (로밍 eSIM이면 없어도 됨)', 'VPN'),
];
// 이미 있는 항목에 사용 팁 붙이기: [포함 글자, 팁]
export const PACK_CHECK_NOTES = [
  ['알리페이', '앱 설치 → 회원가입 → 카드 등록 → QR 스캔 결제. 지하철·버스 결제 가능, 관광객용 Tour Pass 기능.'],
  ['디디', '출발지·목적지 입력 → 차량 선택 후 호출. 일반 택시보다 저렴한 경우가 많고 영어 지원, 알리페이 결제 연동.'],
  ['고덕', '중국에서 가장 정확한 지도. 지하철 노선·리뷰 확인. 가고 싶은 곳 별표 저장 후 한국어 메모 가능.'],
];

// 항공 일정 변경 (v2): 가는 편 12/10 16:10 → 12/9 20:50 인천 → 22:10 훙차오 T1 (중국동방항공)
export const PACK_FLIGHT_FIX = {
  match: (t) => t.type === 'flight' && t.date === '2026-12-10' && t.depart === '16:10',
  patch: { date: '2026-12-09', depart: '20:50', arrive: '22:10', to: '상하이 훙차오 T1', ref: '중국동방항공', memo: '가는 편 · 약 2시간 20분 (현지 시각 도착)' },
  tripFrom: '2026-12-10',
  tripTo: '2026-12-09',
};

// 참고 사이트 (v4)
export const PACK_LINKS = [
  { id: 'pk_link_nau2001', title: '양꼬치&베이징덕&점도덕&지엔빙&에그타르트', url: 'https://m.blog.naver.com/nau2001/224279139530', memo: '상하이 맛집 BEST10 (헌지우이치엔·예상하이·점도덕·페이다추·라이라이·하이디라오 …)', order: 1, src: 'pack' },
];

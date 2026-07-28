/**
 * 속보 상황판 — 수집 백엔드
 * 배포: 배포 > 새 배포 > 웹 앱 / 실행 계정: 나 / 액세스: 모든 사용자
 * 배포 후 나오는 /exec 주소를 대시보드 HTML의 CONFIG.ENDPOINT 에 붙여넣는다.
 *
 * 최초 1회: setKeys() 를 열어 값 채우고 실행 → 스크립트 속성에 저장됨
 * 점검: testFeeds() 실행 후 실행 로그에서 살아있는 피드만 남긴다
 */

/* ═══ 1. 수집 대상 ═══════════════════════════════════════════
   region 을 지정하면 그 매체 기사는 무조건 해당 지역으로 분류한다(지역지).
   region: null 이면 본문 키워드로 판별한다(전국지·통신사).
   ※ 주소는 매체 사정으로 자주 바뀐다. 반드시 testFeeds() 로 확인할 것.        */
const FEEDS = [
  { name: '매일신문',   url: 'https://www.imaeil.com/rss/imaeil_all.xml', region: '대구' },
  { name: '동아일보',   url: 'https://rss.donga.com/total.xml',            region: null  },
  { name: '경향신문',   url: 'https://www.khan.co.kr/rss/rssdata/total_news.xml', region: null },
  { name: '한겨레',     url: 'https://www.hani.co.kr/rss/',                region: null  }
];

/* 네이버 뉴스 검색 API 사용 여부. 키가 없으면 자동으로 건너뛴다.
   17개 시·도를 각각 조회하므로 갱신 주기 2분 기준 하루 약 12,240회(무료 한도 25,000회). */
const USE_NAVER   = true;
const NAVER_TOPN  = 2;    // 지역당 최대 기사 수
const CACHE_SEC   = 60;   // 응답 캐시(초). 여러 화면이 붙어도 원본 호출은 이 주기로만 발생

/* ═══ 2. 지역 판별 사전 ═══════════════════════════════════════
   긴 낱말이 먼저 걸리도록 자동 정렬한다. 오분류가 보이면 여기에 추가/삭제. */
const DICT = {
  '서울': ['서울','종로구','강남구','서초구','송파구','마포구','영등포','용산구','성동구','광진구','노원구','은평구','서대문','강서구','양천구','구로구','금천구','동작구','관악구','강동구','도봉구','중랑구','성북구','동대문','여의도','명동','잠실','청와대','용산 대통령실'],
  '부산': ['부산','해운대','사하구','기장군','동래','남포동','서면','북항','감천','가덕도','에코델타'],
  '대구': ['대구','수성구','달서구','달성군','동성로','동대구','서대구','팔공산','두류','신천','앞산','대구경북신공항'],
  '인천': ['인천','송도','영종도','강화군','부평','계양','미추홀','연수구','남동구','검단','청라'],
  '광주': ['광주광역시','광주시','광산구','상무지구','첨단지구','무등산','충장로','5·18','오월'],
  '대전': ['대전','유성구','둔산','대덕','원도심 대전','대전역'],
  '울산': ['울산','울주군','태화강','온산','장생포'],
  '세종': ['세종시','세종특별자치시','조치원','정부세종청사'],
  '경기': ['경기도','수원','성남','고양시','용인','부천','안산시','안양','남양주','화성시','평택','의정부','시흥','파주','김포','광명','군포','하남','오산','이천시','양주시','안성','포천','의왕','양평','여주','동두천','과천','가평','연천','판교','분당','일산','광교','동탄'],
  '강원': ['강원','춘천','원주','강릉','동해시','태백','속초','삼척','홍천','횡성','영월','평창','정선','철원','화천','양구','인제','양양','설악산','오대산'],
  '충북': ['충북','충청북도','청주','충주','제천','보은','옥천','영동군','증평','진천','괴산','음성군','단양','오송','오창'],
  '충남': ['충남','충청남도','천안','공주시','보령','아산시','서산','논산','계룡','당진','금산','부여','서천','청양','홍성','예산군','태안','내포신도시'],
  '전북': ['전북','전라북도','전주','군산','익산','정읍','남원','김제','완주','진안','무주','장수군','임실','순창','고창','부안','새만금'],
  '전남': ['전남','전라남도','목포','여수','순천시','나주','광양','담양','곡성','구례','고흥','보성','화순','장흥','강진','해남','영암','무안','함평','영광군','장성군','완도','진도','신안','여수산단'],
  '경북': ['경북','경상북도','포항','경주','김천','안동','구미','영주','영천','상주시','문경','경산','군위','의성','청송','영양군','영덕','청도','고령','성주','칠곡','예천','봉화','울진','울릉','독도'],
  '경남': ['경남','경상남도','창원','진주시','통영','사천','김해','밀양','거제','양산시','의령','함안','창녕','남해군','하동','산청','함양','거창','합천'],
  '제주': ['제주','서귀포','한라산','우도','성산일출']
};
const URG3 = ['속보','사망','숨져','숨진','화재','폭발','붕괴','침수','지진','산불','추락','실종','감전','충돌','전복','대피','긴급','체포','구속','압수수색','사고','중상','부상','태풍','호우','폭우','한파','폭염경보','정전','누출','유출','응급','구조','피해'];
const URG2 = ['협약','착공','준공','유치','선정','확정','예산','조례','추진','개최','지정','공모','심의','개통','출범','논란','반발','촉구','국비','투자','설립','개편','대책','규탄','성명'];

/* ═══ 3. 엔드포인트 ═══════════════════════════════════════════ */
function doGet(e) {
  const nocache = e && e.parameter && e.parameter.fresh === '1';
  const cache = CacheService.getScriptCache();
  if (!nocache) {
    const hit = cache.get('board');
    if (hit) return json(JSON.parse(hit));
  }
  let out;
  try {
    out = build();
    cache.put('board', JSON.stringify(out), CACHE_SEC);
  } catch (err) {
    out = { ok: false, error: String(err), items: [] };
  }
  return json(out);
}
function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

function build() {
  let raw = [].concat(collectRss(), collectNaver());
  raw = dedupe(raw);

  const unknown = [];
  raw.forEach(function (it) {
    if (!it.region) it.region = guessRegion(it.headline + ' ' + it.summary);
    if (!it.region) unknown.push(it);
    it.urgency = scoreUrgency(it.headline + ' ' + it.summary);
  });

  // 키워드로 못 가린 것만 모아서 한 번에 Claude 에게 묻는다
  if (unknown.length) classifyWithClaude(unknown);

  const items = raw.filter(function (i) { return i.region; })
                   .sort(function (a, b) { return b.urgency - a.urgency || b.ts - a.ts; });

  // 지역 쏠림 방지: 지역당 최대 4건
  const cnt = {}, keep = [];
  items.forEach(function (i) {
    cnt[i.region] = (cnt[i.region] || 0) + 1;
    if (cnt[i.region] <= 4) keep.push(i);
  });

  return {
    ok: true,
    updated: Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'),
    total: keep.length,
    unresolved: unknown.filter(function (u) { return !u.region; }).length,
    items: keep.slice(0, 60).map(function (i) {
      return { region: i.region, headline: i.headline, summary: i.summary,
               urgency: i.urgency, source: i.source, time: i.time, link: i.link };
    })
  };
}

/* ═══ 4. RSS 수집 ═════════════════════════════════════════════ */
function collectRss() {
  if (!FEEDS.length) return [];
  const reqs = FEEDS.map(function (f) {
    return { url: f.url, muteHttpExceptions: true, followRedirects: true,
             headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBoard/1.0)' } };
  });
  let res;
  try { res = UrlFetchApp.fetchAll(reqs); } catch (e) { return []; }

  const out = [];
  res.forEach(function (r, i) {
    if (r.getResponseCode() !== 200) return;
    const f = FEEDS[i];
    let doc;
    try { doc = XmlService.parse(r.getContentText()); } catch (e) { return; }
    const root = doc.getRootElement();
    const atom = XmlService.getNamespace('http://www.w3.org/2005/Atom');
    let nodes = [];
    const ch = root.getChild('channel');
    if (ch) nodes = ch.getChildren('item');
    else nodes = root.getChildren('entry', atom);

    nodes.slice(0, 25).forEach(function (n) {
      const t = txt(n, 'title', atom);
      if (!t) return;
      const d = txt(n, 'description', atom) || txt(n, 'summary', atom) || '';
      let link = txt(n, 'link', atom);
      if (!link) { const l = n.getChild('link', atom); if (l) link = l.getAttribute('href') ? l.getAttribute('href').getValue() : ''; }
      const pub = txt(n, 'pubDate', atom) || txt(n, 'updated', atom) || txt(n, 'published', atom) || '';
      out.push(mk(t, d, f.name, link, pub, f.region));
    });
  });
  return out;
}
function txt(node, name, ns) {
  let c = node.getChild(name);
  if (!c && ns) c = node.getChild(name, ns);
  return c ? c.getText().trim() : '';
}

/* ═══ 5. 네이버 뉴스 검색 ══════════════════════════════════════ */
function collectNaver() {
  if (!USE_NAVER) return [];
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty('NAVER_ID'), sec = p.getProperty('NAVER_SECRET');
  if (!id || !sec) return [];

  const names = Object.keys(DICT);
  const reqs = names.map(function (r) {
    return {
      url: 'https://openapi.naver.com/v1/search/news.json?display=' + (NAVER_TOPN + 3) +
           '&sort=date&query=' + encodeURIComponent(r),
      headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': sec },
      muteHttpExceptions: true
    };
  });
  let res;
  try { res = UrlFetchApp.fetchAll(reqs); } catch (e) { return []; }

  const out = [];
  res.forEach(function (r, i) {
    if (r.getResponseCode() !== 200) return;
    let body;
    try { body = JSON.parse(r.getContentText()); } catch (e) { return; }
    (body.items || []).slice(0, NAVER_TOPN).forEach(function (it) {
      out.push(mk(strip(it.title), strip(it.description), host(it.originallink || it.link),
                  it.originallink || it.link, it.pubDate, names[i]));
    });
  });
  return out;
}
function strip(s) {
  return String(s || '').replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&apos;|&#39;/g, "'").replace(/&nbsp;/g, ' ').trim();
}
function host(u) {
  const m = String(u || '').match(/^https?:\/\/(?:www\.)?([^\/]+)/);
  return m ? m[1].replace(/\.(co\.kr|com|kr|net)$/, '') : '';
}

/* ═══ 6. 가공 ═════════════════════════════════════════════════ */
function mk(title, desc, source, link, pub, region) {
  const d = pub ? new Date(pub) : new Date();
  const ok = !isNaN(d.getTime());
  return {
    headline: cut(strip(title), 42),
    summary : cut(strip(desc), 62),
    source  : source || '',
    link    : link || '',
    ts      : ok ? d.getTime() : Date.now(),
    time    : Utilities.formatDate(ok ? d : new Date(), 'Asia/Seoul', 'HH:mm'),
    region  : region || null,
    urgency : 1
  };
}
function cut(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function dedupe(arr) {
  const seen = {}, out = [];
  arr.forEach(function (i) {
    const k = i.headline.replace(/[^가-힣a-zA-Z0-9]/g, '').slice(0, 18);
    if (!k || seen[k]) return;
    seen[k] = 1; out.push(i);
  });
  return out;
}

function guessRegion(text) {
  let best = null, len = 0;
  Object.keys(DICT).forEach(function (r) {
    DICT[r].forEach(function (w) {
      if (w.length > len && text.indexOf(w) >= 0) { best = r; len = w.length; }
    });
  });
  return best;
}

function scoreUrgency(text) {
  for (let i = 0; i < URG3.length; i++) if (text.indexOf(URG3[i]) >= 0) return 3;
  for (let j = 0; j < URG2.length; j++) if (text.indexOf(URG2[j]) >= 0) return 2;
  return 1;
}

/* ═══ 7. 미분류분만 Claude 에게 ═══════════════════════════════ */
function classifyWithClaude(list) {
  const key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_KEY');
  if (!key || !list.length) return;
  const names = Object.keys(DICT);
  const lines = list.slice(0, 25).map(function (it, i) { return i + '. ' + it.headline; }).join('\n');

  const prompt = '다음 한국 기사 제목이 어느 시·도 소식인지 판별하라.\n' +
    '가능한 값: ' + names.join(' ') + '\n' +
    '특정 지역과 무관한 전국·국제 뉴스는 null 로 표기한다.\n' +
    '출력은 {"번호":"지역"} 형태의 JSON 객체 하나만. 설명 금지.\n\n' + lines;

  try {
    const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (res.getResponseCode() !== 200) return;
    const t = JSON.parse(res.getContentText()).content
      .filter(function (b) { return b.type === 'text'; })
      .map(function (b) { return b.text; }).join('');
    const s = t.indexOf('{'), e = t.lastIndexOf('}');
    if (s < 0) return;
    const map = JSON.parse(t.slice(s, e + 1));
    Object.keys(map).forEach(function (k) {
      const idx = parseInt(k, 10);
      if (list[idx] && names.indexOf(map[k]) >= 0) list[idx].region = map[k];
    });
  } catch (err) { /* 실패해도 키워드 결과로 진행 */ }
}

/* ═══ 8. 운영용 도구 ══════════════════════════════════════════ */
function setKeys() {
  PropertiesService.getScriptProperties().setProperties({
    NAVER_ID:      '여기에_네이버_클라이언트ID',
    NAVER_SECRET:  '여기에_네이버_시크릿',
    ANTHROPIC_KEY: '여기에_앤트로픽_키'      // 미분류 보정용. 없으면 키워드만으로 동작
  });
  Logger.log('저장 완료');
}

/** 피드가 살아있는지 확인한다. 실행 로그에서 200 이 아닌 것은 FEEDS 에서 지운다. */
function testFeeds() {
  FEEDS.forEach(function (f) {
    let code = 'ERR', n = 0;
    try {
      const r = UrlFetchApp.fetch(f.url, { muteHttpExceptions: true, followRedirects: true });
      code = r.getResponseCode();
      if (code === 200) {
        const root = XmlService.parse(r.getContentText()).getRootElement();
        const ch = root.getChild('channel');
        n = ch ? ch.getChildren('item').length
               : root.getChildren('entry', XmlService.getNamespace('http://www.w3.org/2005/Atom')).length;
      }
    } catch (e) { code = 'PARSE_FAIL'; }
    Logger.log(f.name + '  ' + code + '  기사 ' + n + '건  ' + f.url);
  });
}

/** 전체 파이프라인을 눈으로 확인한다. */
function testBuild() {
  const r = build();
  Logger.log('총 ' + r.total + '건 / 미분류 ' + r.unresolved + '건');
  r.items.slice(0, 15).forEach(function (i) {
    Logger.log('[' + i.urgency + '] ' + i.region + ' | ' + i.headline + ' (' + i.source + ')');
  });
}

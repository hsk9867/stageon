/* =====================================================
   스테이지온 공통 스크립트
   - 데이터 로드 / 상태 계산 / 공통 레이아웃 / 페이지별 초기화
   ===================================================== */
(function () {
  'use strict';

  // 접수 API (Cloudflare Worker) 주소. 비워두면 브라우저 저장(localStorage)만 사용.
  const API_BASE = '';

  const SITE = {
    name: '스테이지온',
    slogan: '무대에 서는 모든 순간',
    phone: '0507-1234-5678',
    email: 'help@stageon.kr',
    company: '스테이지온',
    ceo: '홍길동',
    bizNo: '000-00-00000',
    address: '서울특별시',
  };

  const ROOT = (function () {
    // 하위 폴더에서도 data/ 경로가 맞도록 처리 (현재는 루트 단일 폴더)
    return '';
  })();

  const S = (window.StageOn = {});
  S.SITE = SITE;
  S.API_BASE = API_BASE;

  /* ---------- 유틸 ---------- */
  const DAY = 86400000;
  const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  S.today = today;

  S.parse = (str) => {
    if (!str) return null;
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  S.dday = (str) => {
    const d = S.parse(str);
    if (!d) return null;
    return Math.round((d - today) / DAY);
  };
  S.ddayLabel = (str) => {
    const n = S.dday(str);
    if (n === null) return '';
    if (n === 0) return 'D-DAY';
    if (n < 0) return '종료';
    return 'D-' + n;
  };
  S.fmt = (str, opt) => {
    const d = S.parse(str);
    if (!d) return '미정';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    if (opt === 'short') return `${m}.${dd} (${WEEK[d.getDay()]})`;
    if (opt === 'md') return `${d.getMonth() + 1}월 ${d.getDate()}일`;
    return `${y}.${m}.${dd} (${WEEK[d.getDay()]})`;
  };
  S.esc = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  S.qs = (k) => new URLSearchParams(location.search).get(k);
  S.num = (n) => Number(n).toLocaleString('ko-KR');

  /* ---------- 상태 ---------- */
  S.status = (c) => {
    const dd = S.dday(c.date);
    if (dd !== null && dd < 0) return { key: 'done', label: '종료' };
    if (!c.applyStart || !c.applyEnd) return { key: 'check', label: '확인 필요' };
    const s = S.parse(c.applyStart);
    const e = S.parse(c.applyEnd);
    if (today < s) return { key: 'soon', label: '접수 예정' };
    if (today > e) return { key: 'closed', label: '마감' };
    const left = Math.round((e - today) / DAY);
    if (left <= 7) return { key: 'urgent', label: `마감 임박 (${left === 0 ? '오늘' : left + '일 남음'})` };
    return { key: 'open', label: '접수 중' };
  };
  S.statusShort = (c) => {
    const st = S.status(c);
    return { key: st.key, label: st.key === 'urgent' ? '마감 임박' : st.label };
  };

  /* ---------- 데이터 ---------- */
  let _data = null;
  S.loadData = async () => {
    if (_data) return _data;
    const res = await fetch(ROOT + 'data/competitions.json?v=' + Date.now());
    if (!res.ok) throw new Error('데이터를 불러오지 못했습니다.');
    _data = await res.json();
    _data.competitions.sort((a, b) => a.date.localeCompare(b.date));
    _data.orgMap = {};
    _data.organizations.forEach((o) => (_data.orgMap[o.id] = o));
    return _data;
  };
  S.org = (id) => (_data && _data.orgMap[id]) || { id, name: id, color: '#444' };
  S.comp = (id) => _data && _data.competitions.find((c) => c.id === id);
  S.upcoming = () => _data.competitions.filter((c) => S.dday(c.date) >= 0);

  /* ---------- 저장 (내 대회 / 신청 내역) ---------- */
  const LS = {
    get(k, def) {
      try {
        const v = localStorage.getItem(k);
        return v ? JSON.parse(v) : def;
      } catch (e) {
        return def;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch (e) {}
    },
  };
  S.saved = () => LS.get('stageon_saved', []);
  S.isSaved = (id) => S.saved().includes(id);
  S.toggleSaved = (id) => {
    const list = S.saved();
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    else list.push(id);
    LS.set('stageon_saved', list);
    return i < 0;
  };
  S.apps = () => LS.get('stageon_apps', []);
  S.addApp = (a) => {
    const list = S.apps();
    list.unshift(a);
    LS.set('stageon_apps', list);
  };
  S.LS = LS;

  /* ---------- 토스트 ---------- */
  let toastEl;
  S.toast = (msg) => {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 2200);
  };

  /* ---------- 아이콘 ---------- */
  const ICONS = {
    calendar: `<svg viewBox="0 0 60 60" fill="none"><defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffb3b0"/><stop offset="1" stop-color="#f26d6a"/></linearGradient></defs><rect x="8" y="12" width="44" height="40" rx="8" fill="#fff" stroke="#e9d6d5" stroke-width="2"/><rect x="8" y="12" width="44" height="14" rx="8" fill="url(#g1)"/><rect x="8" y="20" width="44" height="6" fill="#f26d6a"/><rect x="18" y="6" width="5" height="12" rx="2.5" fill="#444"/><rect x="37" y="6" width="5" height="12" rx="2.5" fill="#444"/><rect x="16" y="32" width="8" height="7" rx="2" fill="#f1f1f4"/><rect x="26" y="32" width="8" height="7" rx="2" fill="#f1f1f4"/><rect x="36" y="32" width="8" height="7" rx="2" fill="#ffd9d8"/><rect x="16" y="41" width="8" height="7" rx="2" fill="#f1f1f4"/><rect x="26" y="41" width="8" height="7" rx="2" fill="#f1f1f4"/><circle cx="46" cy="44" r="9" fill="#f26d6a"/><path d="M42 44l3 3 5-6" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    clipboard: `<svg viewBox="0 0 60 60" fill="none"><defs><linearGradient id="g2" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#8fb4ff"/><stop offset="1" stop-color="#3b6fe0"/></linearGradient></defs><rect x="12" y="10" width="36" height="44" rx="6" fill="url(#g2)"/><rect x="16" y="16" width="28" height="34" rx="3" fill="#fff"/><rect x="22" y="6" width="16" height="9" rx="3" fill="#2b54b3"/><path d="M21 25h18M21 32h18M21 39h11" stroke="#c9d4ea" stroke-width="2.5" stroke-linecap="round"/><path d="M20 25l2 2 4-4" stroke="#3b6fe0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M38 44l10-10 4 4-10 10-5 1 1-5z" fill="#f5c04a" stroke="#d99a16" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
    search: `<svg viewBox="0 0 60 60" fill="none"><circle cx="26" cy="26" r="15" fill="#fff" stroke="#f26d6a" stroke-width="5"/><path d="M37 37l12 12" stroke="#f26d6a" stroke-width="6" stroke-linecap="round"/><circle cx="26" cy="26" r="7" fill="#ffd9d8"/></svg>`,
    pen: `<svg viewBox="0 0 60 60" fill="none"><rect x="12" y="10" width="32" height="42" rx="5" fill="#fff" stroke="#f3b1af" stroke-width="2"/><path d="M19 22h18M19 30h18M19 38h10" stroke="#f3b1af" stroke-width="2.5" stroke-linecap="round"/><path d="M34 42l14-14 6 6-14 14-7 1 1-7z" fill="#f26d6a"/></svg>`,
    dumbbell: `<svg viewBox="0 0 60 60" fill="none"><rect x="6" y="22" width="8" height="16" rx="2" fill="#f26d6a"/><rect x="46" y="22" width="8" height="16" rx="2" fill="#f26d6a"/><rect x="13" y="18" width="8" height="24" rx="2" fill="#ff9a97"/><rect x="39" y="18" width="8" height="24" rx="2" fill="#ff9a97"/><rect x="20" y="27" width="20" height="6" rx="3" fill="#444"/></svg>`,
    trophy: `<svg viewBox="0 0 60 60" fill="none"><path d="M18 10h24v14a12 12 0 01-24 0V10z" fill="#f5c04a"/><path d="M18 14h-6a6 6 0 006 10M42 14h6a6 6 0 01-6 10" stroke="#f5c04a" stroke-width="4" stroke-linecap="round"/><rect x="26" y="34" width="8" height="8" fill="#d99a16"/><rect x="18" y="42" width="24" height="8" rx="2" fill="#444"/><path d="M30 15l2 4 4 .5-3 3 .8 4-3.8-2-3.8 2 .8-4-3-3 4-.5z" fill="#fff"/></svg>`,
    flag: `<svg viewBox="0 0 60 60" fill="none"><path d="M16 8v46" stroke="#444" stroke-width="4" stroke-linecap="round"/><path d="M18 10h26l-6 9 6 9H18V10z" fill="#f26d6a"/></svg>`,
    stage: `<svg viewBox="0 0 60 60" fill="none"><path d="M8 48h44" stroke="#444" stroke-width="4" stroke-linecap="round"/><path d="M14 48l4-14h24l4 14" fill="#ff9a97"/><circle cx="30" cy="22" r="7" fill="#f26d6a"/><path d="M22 34c0-6 16-6 16 0" fill="#f26d6a"/><path d="M10 12l3 3M50 12l-3 3M30 6v4" stroke="#f5c04a" stroke-width="3" stroke-linecap="round"/></svg>`,
    arrow: `<svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M6 16h20M18 8l8 8-8 8" stroke="#111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    chev: `<svg viewBox="0 0 16 16" fill="none" stroke="#999" stroke-width="1.5"><path d="M6 3l5 5-5 5"/></svg>`,
    down: `<svg width="21" height="12" viewBox="0 0 21 12" fill="none"><path d="M1 1l9.5 9.5L20 1" stroke="#333" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  };
  S.ICONS = ICONS;

  /* ---------- 공통 레이아웃 ---------- */
  const NAV = [
    ['competitions.html', '대회 일정', 'competitions'],
    ['prepare.html', '대회 준비', 'prepare'],
    ['my.html', '내 대회', 'my'],
    ['index.html#faq', '자주하는 질문', 'faq'],
  ];
  S.renderShell = () => {
    const page = document.body.dataset.page || '';
    const head = document.getElementById('site-header');
    if (head) {
      const links = NAV.map(
        ([href, label, key]) => `<a href="${ROOT}${href}" class="${page === key ? 'active' : ''}">${label}</a>`
      ).join('');
      head.innerHTML = `
        <header class="ld-header">
          <div class="ld-header-inner">
            <div class="ld-header-left">
              <a href="${ROOT}index.html" class="ld-header-logo">${SITE.name}<span class="dot"></span></a>
              <nav class="ld-header-nav">
                ${links.slice(0, links.lastIndexOf('<a'))}
                <span class="ld-header-divider"></span>
                ${links.slice(links.lastIndexOf('<a'))}
              </nav>
            </div>
            <div class="ld-header-right">
              <a href="${ROOT}competitions.html?status=open" class="ld-header-cta primary">대회 신청</a>
              <button class="ld-menu-btn" aria-label="메뉴" data-menu><span></span></button>
            </div>
          </div>
          <nav class="ld-mobile-nav" data-mobile-nav>${links}</nav>
        </header>`;
      head.querySelector('[data-menu]').addEventListener('click', () => {
        head.querySelector('[data-mobile-nav]').classList.toggle('open');
      });
    }
    const foot = document.getElementById('site-footer');
    if (foot) {
      foot.innerHTML = `
        <footer class="ld-footer">
          <div class="inner">
            <div class="ld-footer-top">
              <div>
                <div class="ld-footer-links"><span>이용약관</span><i></i><b>개인정보처리방침</b><i></i><span>대회 등록 요청</span></div>
                <div class="ld-footer-info" style="margin-top:20px">
                  <b>${SITE.company}</b>&nbsp; 대표 : ${SITE.ceo} &nbsp; 사업자등록번호 : ${SITE.bizNo}<br>
                  주소 : ${SITE.address}<br>
                  메일 : ${SITE.email}
                </div>
                <div class="ld-footer-info" style="margin-top:16px">© ${SITE.name}. 대회 정보는 각 단체 공식 공지를 기준으로 하며, 변경될 수 있습니다.</div>
              </div>
              <div class="ld-footer-contact"><small>대회 문의 (평일 10:00~18:00)</small><strong>${SITE.phone}</strong></div>
            </div>
            <div class="ld-footer-bottom">
              <div class="ld-footer-logo">${SITE.name}<span class="dot"></span></div>
              <div class="ld-footer-sns"><a href="#" aria-label="카카오톡">TALK</a><a href="#" aria-label="블로그">blog</a><a href="#" aria-label="인스타그램">IG</a><a href="#" aria-label="유튜브">YT</a></div>
            </div>
          </div>
        </footer>
        <div class="ld-float">
          <a href="${ROOT}competitions.html?status=open" class="ld-float-btn apply">대회<br>신청</a>
          <button class="ld-float-btn top" aria-label="맨 위로" onclick="window.scrollTo({top:0,behavior:'smooth'})">↑</button>
        </div>`;
    }
  };

  /* ---------- 카드 렌더러 ---------- */
  S.chips = (arr, max) => {
    const list = arr.slice(0, max);
    const rest = arr.length - list.length;
    return `<div class="chips">${list.map((x) => `<span>${S.esc(x)}</span>`).join('')}${rest > 0 ? `<span class="more">+${rest}</span>` : ''}</div>`;
  };
  S.compCard = (c) => {
    const o = S.org(c.org);
    const st = S.statusShort(c);
    const d = S.parse(c.date);
    return `
      <a class="comp-card" href="${ROOT}competition.html?id=${c.id}">
        <div class="comp-card-poster" style="background:linear-gradient(135deg, ${o.color} 0%, #1d2124 130%)">
          <span class="org-mark">${S.esc(o.name)}</span>
          <span class="dday">${S.ddayLabel(c.date)}</span>
          <div class="date-big">${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}</div>
          <div class="date-sub">${d.getFullYear()}년 ${WEEK[d.getDay()]}요일 · ${S.esc(c.region)}</div>
        </div>
        <div class="comp-card-body">
          <h3>${S.esc(c.name)}</h3>
          <div class="venue">${S.esc(c.venue)}</div>
          ${S.chips(c.categories, 3)}
          <div class="comp-card-foot"><span class="status ${st.key}">${st.label}</span><span style="font-size:12px;color:#999">${c.applyMode === 'external' ? '단체 접수' : '온라인 접수'}</span></div>
        </div>
      </a>`;
  };
  S.compRow = (c) => {
    const o = S.org(c.org);
    const st = S.statusShort(c);
    const d = S.parse(c.date);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    return `
      <a class="comp-row" href="${ROOT}competition.html?id=${c.id}">
        <div class="date-col ${weekend ? 'weekend' : ''}">
          <div class="y">${d.getFullYear()}</div>
          <div class="md">${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}</div>
          <div class="w">${WEEK[d.getDay()]}요일</div>
        </div>
        <div class="info">
          <div class="badges"><span class="org-badge" style="background:${o.color}">${S.esc(o.name)}</span>${c.types.map((t) => `<span class="type-tag">${S.esc(t)}</span>`).join('')}</div>
          <h3>${S.esc(c.name)}</h3>
          <div class="venue">${S.esc(c.region)} · ${S.esc(c.venue)}</div>
          ${S.chips(c.categories, 5)}
        </div>
        <div class="side">
          <span class="status ${st.key}">${st.label}</span>
          <span class="dday">${S.ddayLabel(c.date)}</span>
          <span class="link">상세 보기 →</span>
        </div>
      </a>`;
  };
  S.recoCard = (c) => {
    const o = S.org(c.org);
    return `
      <a class="reco-card" href="${ROOT}competition.html?id=${c.id}">
        <div class="reco-card-img" style="background:linear-gradient(160deg, ${o.color} 0%, #1d2124 140%)">
          <span class="big">${S.esc(o.name.split('/')[0].split(' ')[0])}</span>
          <span class="date">${S.fmt(c.date, 'short')}</span>
          <span class="dday">${S.ddayLabel(c.date)}</span>
        </div>
        <div class="reco-card-meta"><h4>${S.esc(c.name)}</h4><span class="tag">${S.esc(c.types[0] || '')}</span></div>
        <div class="reco-card-region">${S.esc(c.region)} · ${S.esc(c.venue)}</div>
      </a>`;
  };

  /* ---------- 카운터 애니메이션 ---------- */
  S.countUp = (el, target, dur) => {
    const start = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - start) / (dur || 1200));
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = S.num(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  /* ---------- 접수 API ---------- */
  S.submitApplication = async (payload) => {
    const code = 'SO-' + Date.now().toString(36).toUpperCase().slice(-6);
    const record = Object.assign({ code, createdAt: new Date().toISOString(), synced: false }, payload);
    if (API_BASE) {
      const res = await fetch(API_BASE.replace(/\/$/, '') + '/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || '접수 서버 오류가 발생했습니다.');
      record.code = json.code || code;
      record.synced = true;
    }
    S.addApp(record);
    return record;
  };

  /* ---------- 페이지별 초기화 ---------- */
  const pages = {};

  pages.home = async () => {
    // 히어로 슬라이더
    const slides = document.querySelectorAll('.ld-hero-slide');
    const dots = document.querySelectorAll('.ld-hero-dots button');
    let cur = 0;
    const show = (i) => {
      cur = i;
      slides.forEach((s, k) => s.classList.toggle('active', k === i));
      dots.forEach((d, k) => d.classList.toggle('active', k === i));
    };
    dots.forEach((d, i) => d.addEventListener('click', () => show(i)));
    if (slides.length > 1) setInterval(() => show((cur + 1) % slides.length), 6000);

    // 탭
    document.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b === btn));
        document.querySelectorAll('[data-tab-panel]').forEach((p) => (p.hidden = p.dataset.tabPanel !== btn.dataset.tab));
      });
    });

    const data = await S.loadData();
    const up = S.upcoming();

    // 곧 열리는 대회
    const track = document.getElementById('upcoming-track');
    track.innerHTML = up.slice(0, 12).map(S.compCard).join('');
    document.getElementById('upcoming-count').textContent = up.length;

    // 통계
    const stats = {
      'stat-total': data.competitions.length,
      'stat-upcoming': up.length,
      'stat-orgs': data.organizations.length,
      'stat-apps': 1284 + S.apps().length,
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        Object.keys(stats).forEach((id) => {
          const el = document.getElementById(id);
          if (el) S.countUp(el, stats[id]);
        });
        io.disconnect();
      });
    });
    io.observe(document.querySelector('.ld-stats-chips'));

    // 단체별 추천 행
    const recoWrap = document.getElementById('reco-rows');
    const byOrg = {};
    up.forEach((c) => (byOrg[c.org] = byOrg[c.org] || []).push(c));
    const orgOrder = Object.keys(byOrg).sort((a, b) => byOrg[b].length - byOrg[a].length).slice(0, 4);
    recoWrap.innerHTML = orgOrder
      .map((id) => {
        const o = S.org(id);
        return `
          <div class="ld-reco-row">
            <div class="ld-reco-title"><span class="ico" style="background:${o.color}">${S.esc(o.name.slice(0, 1))}</span>${S.esc(o.name)} 대회<small>${o.natural ? '내추럴' : ''}</small>
              <a href="${ROOT}competitions.html?org=${id}" class="ld-upcoming-more">전체 보기 →</a></div>
            <div class="ld-track">${byOrg[id].slice(0, 6).map(S.recoCard).join('')}</div>
          </div>`;
      })
      .join('');
  };

  pages.competitions = async () => {
    const data = await S.loadData();
    const comps = data.competitions;
    const state = {
      q: '',
      org: new Set(),
      region: new Set(),
      cat: new Set(),
      type: new Set(),
      status: new Set(),
      sort: 'date',
      past: false,
    };
    // URL 파라미터 초기값
    const pick = (k, set) => {
      const v = S.qs(k);
      if (v) v.split(',').forEach((x) => set.add(x));
    };
    pick('org', state.org);
    pick('region', state.region);
    pick('cat', state.cat);
    pick('type', state.type);
    pick('status', state.status);
    if (S.qs('q')) state.q = S.qs('q');

    const panel = document.getElementById('filter-panel');
    const groups = [
      ['org', '주최 단체', data.organizations.map((o) => [o.id, o.name])],
      ['region', '지역', data.regions.map((r) => [r, r])],
      ['cat', '종목', data.categories.map((c) => [c, c])],
      ['type', '대회 유형', data.types.map((t) => [t, t])],
      ['status', '접수 상태', [['open', '접수 중'], ['urgent', '마감 임박'], ['soon', '접수 예정'], ['closed', '마감'], ['check', '확인 필요']]],
    ];
    const countOf = (key, val) =>
      comps.filter((c) => {
        if (key === 'org') return c.org === val;
        if (key === 'region') return c.region === val;
        if (key === 'cat') return c.categories.includes(val);
        if (key === 'type') return c.types.includes(val);
        if (key === 'status') return S.status(c).key === val;
      }).length;
    panel.innerHTML =
      groups
        .map(
          ([key, title, items]) => `
        <div class="filter-group">
          <h4>${title}<small>${items.length}</small></h4>
          ${items
            .map(
              ([v, label]) => `<label><input type="checkbox" data-f="${key}" value="${S.esc(v)}" ${state[key].has(v) ? 'checked' : ''}> ${S.esc(label)}<span class="n">${countOf(key, v)}</span></label>`
            )
            .join('')}
        </div>`
        )
        .join('') +
      `<div class="filter-group"><label><input type="checkbox" data-f="past"> 지난 대회 포함</label></div>
       <button class="filter-reset" data-reset>필터 초기화</button>`;

    const qInput = document.getElementById('q');
    qInput.value = state.q;
    const sortSel = document.getElementById('sort');
    const chips = document.querySelectorAll('.quick-chips button');

    const matches = (c) => {
      if (!state.past && S.dday(c.date) < 0) return false;
      if (state.q) {
        const q = state.q.toLowerCase();
        const o = S.org(c.org);
        const hay = [c.name, o.name, c.region, c.venue, ...c.categories, ...c.types].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (state.org.size && !state.org.has(c.org)) return false;
      if (state.region.size && !state.region.has(c.region)) return false;
      if (state.cat.size && !c.categories.some((x) => state.cat.has(x))) return false;
      if (state.type.size && !c.types.some((x) => state.type.has(x))) return false;
      if (state.status.size) {
        const k = S.status(c).key;
        const ok = state.status.has(k) || (state.status.has('open') && k === 'urgent');
        if (!ok) return false;
      }
      return true;
    };

    const render = () => {
      let list = comps.filter(matches);
      if (state.sort === 'deadline') {
        list = list.slice().sort((a, b) => {
          const ea = a.applyEnd || '9999-12-31';
          const eb = b.applyEnd || '9999-12-31';
          return ea.localeCompare(eb);
        });
      }
      document.getElementById('count').innerHTML = `총 <b>${list.length}</b>개 대회`;
      const main = document.getElementById('list-main');
      if (!list.length) {
        main.innerHTML = '<div class="empty">조건에 맞는 대회가 없어요.<br>필터를 조정해 보세요.</div>';
        return;
      }
      if (state.sort === 'deadline') {
        main.innerHTML = `<div class="month-group"><h2>마감 임박순<small>${list.length}개</small></h2>${list.map(S.compRow).join('')}</div>`;
        return;
      }
      const months = {};
      list.forEach((c) => {
        const k = c.date.slice(0, 7);
        (months[k] = months[k] || []).push(c);
      });
      main.innerHTML = Object.keys(months)
        .sort()
        .map((k) => {
          const [y, m] = k.split('-');
          return `<div class="month-group"><h2>${y}년 ${Number(m)}월<small>${months[k].length}개 대회</small></h2>${months[k].map(S.compRow).join('')}</div>`;
        })
        .join('');
      // 퀵칩 활성 표시
      chips.forEach((b) => {
        const f = b.dataset.quick;
        let on = false;
        if (f === 'all') on = !state.org.size && !state.region.size && !state.cat.size && !state.type.size && !state.status.size;
        else if (f.startsWith('status:')) on = state.status.has(f.slice(7));
        else if (f.startsWith('type:')) on = state.type.has(f.slice(5));
        else if (f.startsWith('region:')) on = f.slice(7).split('|').every((r) => state.region.has(r));
        b.classList.toggle('active', on);
      });
    };

    panel.addEventListener('change', (e) => {
      const el = e.target;
      if (el.dataset.f === 'past') state.past = el.checked;
      else if (el.dataset.f) {
        const set = state[el.dataset.f];
        el.checked ? set.add(el.value) : set.delete(el.value);
      }
      render();
    });
    panel.querySelector('[data-reset]').addEventListener('click', () => {
      ['org', 'region', 'cat', 'type', 'status'].forEach((k) => state[k].clear());
      state.q = '';
      qInput.value = '';
      panel.querySelectorAll('input[type=checkbox]').forEach((i) => (i.checked = i.dataset.f === 'past' ? state.past : false));
      render();
    });
    qInput.addEventListener('input', () => {
      state.q = qInput.value.trim();
      render();
    });
    sortSel.addEventListener('change', () => {
      state.sort = sortSel.value;
      render();
    });
    document.getElementById('filter-toggle').addEventListener('click', () => panel.classList.toggle('open'));
    chips.forEach((b) =>
      b.addEventListener('click', () => {
        const f = b.dataset.quick;
        if (f === 'all') ['org', 'region', 'cat', 'type', 'status'].forEach((k) => state[k].clear());
        else if (f.startsWith('status:')) {
          const v = f.slice(7);
          state.status.has(v) ? state.status.delete(v) : state.status.add(v);
        } else if (f.startsWith('type:')) {
          const v = f.slice(5);
          state.type.has(v) ? state.type.delete(v) : state.type.add(v);
        } else if (f.startsWith('region:')) {
          const vs = f.slice(7).split('|');
          const on = vs.every((r) => state.region.has(r));
          vs.forEach((r) => (on ? state.region.delete(r) : state.region.add(r)));
        }
        panel.querySelectorAll('input[data-f]').forEach((i) => {
          if (i.dataset.f !== 'past') i.checked = state[i.dataset.f].has(i.value);
        });
        render();
      })
    );
    render();
  };

  pages.detail = async () => {
    const data = await S.loadData();
    const c = S.comp(S.qs('id'));
    const root = document.getElementById('detail');
    if (!c) {
      root.innerHTML = '<div class="inner"><div class="empty">대회를 찾을 수 없어요. <a href="competitions.html" style="color:#f26d6a;text-decoration:underline">대회 일정으로 돌아가기</a></div></div>';
      return;
    }
    const o = S.org(c.org);
    const st = S.status(c);
    document.title = `${c.name} | ${SITE.name}`;
    const period = c.applyStart && c.applyEnd ? `${S.fmt(c.applyStart)} ~ ${S.fmt(c.applyEnd)}` : '주최 공지 확인 필요';
    const canApply = ['open', 'urgent'].includes(st.key);
    let applyBtn;
    if (c.applyMode === 'external') {
      applyBtn = `<a class="btn btn-primary btn-lg btn-block" href="${S.esc(c.officialUrl || '#')}" target="_blank" rel="noopener">단체 공식 접수 페이지로 이동 ↗</a>`;
    } else if (canApply) {
      applyBtn = `<a class="btn btn-primary btn-lg btn-block" href="${ROOT}apply.html?id=${c.id}">온라인 접수 신청하기</a>`;
    } else if (st.key === 'soon') {
      applyBtn = `<button class="btn btn-primary btn-lg btn-block" disabled>접수 예정 (${S.fmt(c.applyStart, 'short')} 오픈)</button><a class="btn btn-outline btn-block" href="${ROOT}apply.html?id=${c.id}&pre=1">사전 접수 알림 신청</a>`;
    } else if (st.key === 'closed') {
      applyBtn = `<button class="btn btn-primary btn-lg btn-block" disabled>접수 마감</button>`;
    } else if (st.key === 'done') {
      applyBtn = `<button class="btn btn-primary btn-lg btn-block" disabled>종료된 대회</button>`;
    } else {
      applyBtn = `<a class="btn btn-dark btn-lg btn-block" href="${S.esc(c.officialUrl || '#')}" target="_blank" rel="noopener">공식 공지 확인하기 ↗</a>`;
    }
    const related = data.competitions.filter((x) => x.id !== c.id && S.dday(x.date) >= 0 && (x.org === c.org || x.date.slice(0, 7) === c.date.slice(0, 7))).slice(0, 4);
    root.innerHTML = `
      <section class="detail-hero" style="background:linear-gradient(135deg, ${o.color} 0%, #1d2124 130%)">
        <div class="inner">
          <div class="top"><span class="org-badge" style="background:rgba(255,255,255,.2)">${S.esc(o.name)}</span>${c.types.map((t) => `<span class="org-badge" style="background:rgba(0,0,0,.3)">${S.esc(t)}</span>`).join('')}<span class="dday-big">${S.ddayLabel(c.date)}</span></div>
          <h1>${S.esc(c.name)}</h1>
          <div class="date-line">${S.fmt(c.date)} · ${S.esc(c.region)} ${S.esc(c.venue)}</div>
        </div>
      </section>
      <div class="inner detail-layout">
        <div class="detail-main">
          <div>
            <h2 class="section-h">대회 정보</h2>
            <dl class="info-table">
              <div><dt>대회명</dt><dd>${S.esc(c.name)}</dd></div>
              <div><dt>일시</dt><dd>${S.fmt(c.date)}</dd></div>
              <div><dt>장소</dt><dd>${S.esc(c.region)} · ${S.esc(c.venue)}</dd></div>
              <div><dt>주최</dt><dd>${S.esc(o.name)}${o.fullName ? ` <span style="color:#999;font-size:13px">(${S.esc(o.fullName)})</span>` : ''}</dd></div>
              <div><dt>접수 기간</dt><dd>${period}</dd></div>
              <div><dt>참가비</dt><dd>${S.esc(c.fee || '공지 확인')}</dd></div>
              <div><dt>접수 방식</dt><dd>${c.applyMode === 'external' ? '주최 단체 공식 사이트 접수' : `${SITE.name} 온라인 접수`}</dd></div>
              ${c.officialUrl ? `<div><dt>공식 사이트</dt><dd><a href="${S.esc(c.officialUrl)}" target="_blank" rel="noopener">${S.esc(c.officialUrl)}</a></dd></div>` : ''}
            </dl>
          </div>
          <div>
            <h2 class="section-h">종목</h2>
            <div class="cat-list">${c.categories.map((x) => `<span>${S.esc(x)}</span>`).join('')}</div>
          </div>
          <div>
            <h2 class="section-h">대회 소개</h2>
            <p class="desc-box">${S.esc(c.desc || '')}</p>
            <p class="notice-bar" style="margin-top:16px">${S.esc(data.notice)}</p>
          </div>
          <div>
            <h2 class="section-h">주최 단체 안내</h2>
            <div class="org-card">
              <div class="head"><span class="mark" style="background:${o.color}">${S.esc(o.name.slice(0, 2))}</span><h3>${S.esc(o.name)}<small>${S.esc(o.fullName || '')}</small></h3></div>
              <p>${S.esc(o.desc || '')}</p>
              <a class="cnt" href="${ROOT}prepare.html#orgs">단체별 출전 가이드 보기 →</a>
            </div>
          </div>
          ${related.length ? `<div><h2 class="section-h">함께 보면 좋은 대회</h2><div class="related-grid">${related.map(S.compRow).join('')}</div></div>` : ''}
        </div>
        <aside class="detail-side">
          <div class="apply-box">
            <span class="status ${st.key}" style="align-self:flex-start">${st.label}</span>
            <div class="fee"><span>참가비</span><b>${S.esc((c.fee || '공지 확인').split(' ')[0])}</b></div>
            <div class="period">접수 기간 · ${period}</div>
            ${applyBtn}
            <div class="row">
              <button class="btn btn-outline" data-save>${S.isSaved(c.id) ? '♥ 저장됨' : '♡ 내 대회에 저장'}</button>
              <button class="btn btn-outline" data-share>공유</button>
            </div>
            <p class="note">접수 완료 후 참가비 입금 안내가 문자로 발송돼요. 종목·체급 변경은 마감 전까지 가능해요.</p>
          </div>
        </aside>
      </div>`;
    const saveBtn = root.querySelector('[data-save]');
    saveBtn.classList.toggle('saved', S.isSaved(c.id));
    saveBtn.addEventListener('click', () => {
      const on = S.toggleSaved(c.id);
      saveBtn.textContent = on ? '♥ 저장됨' : '♡ 내 대회에 저장';
      saveBtn.classList.toggle('saved', on);
      S.toast(on ? '내 대회에 저장했어요' : '저장을 해제했어요');
    });
    root.querySelector('[data-share]').addEventListener('click', async () => {
      const url = location.href;
      if (navigator.share) {
        try { await navigator.share({ title: c.name, url }); } catch (e) {}
      } else {
        try { await navigator.clipboard.writeText(url); S.toast('링크를 복사했어요'); } catch (e) { prompt('링크 복사', url); }
      }
    });
  };

  pages.apply = async () => {
    const data = await S.loadData();
    const c = S.comp(S.qs('id'));
    const pre = S.qs('pre') === '1';
    const wrap = document.getElementById('apply');
    if (!c) {
      wrap.innerHTML = `<div class="form-section"><h2>대회를 선택하세요</h2><p style="font-size:14px;color:#777">접수할 대회를 먼저 선택해 주세요.</p><a class="btn btn-primary" href="${ROOT}competitions.html?status=open">접수 중인 대회 보기</a></div>`;
      return;
    }
    const o = S.org(c.org);
    const st = S.status(c);
    document.title = `${c.name} 접수 | ${SITE.name}`;
    const compBox = `
      <div class="form-comp">
        <div class="mark" style="background:${o.color}">${S.esc(o.name.slice(0, 4))}</div>
        <div><h3>${S.esc(c.name)}</h3><p>${S.fmt(c.date)} · ${S.esc(c.region)} ${S.esc(c.venue)} · 참가비 ${S.esc(c.fee || '공지 확인')}</p></div>
      </div>`;
    if (c.applyMode === 'external') {
      wrap.innerHTML = `${compBox}<div class="form-section"><h2>단체 공식 접수 대회</h2><p style="font-size:14px;color:#555;line-height:1.7">이 대회는 주최 단체의 공식 사이트에서 접수를 진행해요. 아래 버튼으로 이동한 뒤 안내에 따라 신청해 주세요.</p><a class="btn btn-primary btn-lg" href="${S.esc(c.officialUrl || '#')}" target="_blank" rel="noopener">공식 접수 페이지로 이동 ↗</a></div>`;
      return;
    }
    if (!pre && !['open', 'urgent'].includes(st.key)) {
      wrap.innerHTML = `${compBox}<div class="form-section"><h2>현재 접수 기간이 아니에요</h2><p style="font-size:14px;color:#555">상태: ${st.label}${c.applyStart ? ` · 접수 기간 ${S.fmt(c.applyStart)} ~ ${S.fmt(c.applyEnd)}` : ''}</p><a class="btn btn-outline" href="${ROOT}competition.html?id=${c.id}">대회 상세로 돌아가기</a></div>`;
      return;
    }
    const cats = c.categories;
    wrap.innerHTML = `
      ${compBox}
      <form id="apply-form" novalidate>
        ${pre ? '<p class="notice-bar">접수 오픈 전 사전 알림 신청이에요. 접수가 시작되면 문자로 안내해 드려요.</p>' : ''}
        <div class="form-section">
          <h2>선수 정보</h2>
          <div class="field-row">
            <div class="field"><label>이름<em>*</em></label><input name="name" required placeholder="실명을 입력하세요" autocomplete="name"></div>
            <div class="field"><label>생년월일<em>*</em></label><input name="birth" type="date" required max="${today.toISOString().slice(0, 10)}"></div>
          </div>
          <div class="field"><label>성별<em>*</em></label>
            <div class="radio-group"><label><input type="radio" name="gender" value="남성" required> 남성</label><label><input type="radio" name="gender" value="여성"> 여성</label></div></div>
          <div class="field-row">
            <div class="field"><label>휴대폰<em>*</em></label><input name="phone" type="tel" required placeholder="010-0000-0000" autocomplete="tel"><span class="hint">접수 확인·입금 안내가 문자로 발송돼요</span></div>
            <div class="field"><label>이메일</label><input name="email" type="email" placeholder="example@email.com" autocomplete="email"></div>
          </div>
          <div class="field-row">
            <div class="field"><label>소속 (짐 / 팀)</label><input name="team" placeholder="예: 정글짐 내수점"></div>
            <div class="field"><label>출전 경력<em>*</em></label>
              <select name="career" required><option value="">선택</option><option>첫 출전</option><option>1~2회</option><option>3~5회</option><option>6회 이상</option><option>프로 / 입상 다수</option></select></div>
          </div>
        </div>
        <div class="form-section">
          <h2>출전 종목</h2>
          <div class="field"><label>종목<em>*</em> <span class="hint" style="font-weight:400">복수 선택 가능 (추가 종목 참가비 별도)</span></label>
            <div class="check-group">${cats.map((x) => `<label><input type="checkbox" name="categories" value="${S.esc(x)}"> ${S.esc(x)}</label>`).join('')}</div></div>
          <div class="field-row">
            <div class="field"><label>부문</label>
              <select name="division"><option value="">선택 (해당 시)</option><option>오픈</option><option>노비스 (첫 출전)</option><option>마스터즈 (35세 이상)</option><option>마스터즈 (40세 이상)</option><option>주니어 (23세 이하)</option></select></div>
            <div class="field"><label>체급 / 신장급</label><input name="classInfo" placeholder="예: -75kg, 170cm 이하 (단체 규정 참고)"></div>
          </div>
          <div class="field-row">
            <div class="field"><label>신장 (cm)</label><input name="height" type="number" min="100" max="250" placeholder="175"></div>
            <div class="field"><label>현재 체중 (kg)</label><input name="weight" type="number" min="30" max="200" step="0.1" placeholder="78.5"></div>
          </div>
          <div class="field"><label>요청 사항</label><textarea name="memo" rows="3" placeholder="단체에 전달할 내용이 있으면 적어주세요"></textarea></div>
        </div>
        <div class="form-section">
          <h2>약관 동의</h2>
          <div class="agree-box">
            <label class="all"><input type="checkbox" id="agree-all"> 전체 동의</label>
            <label><input type="checkbox" name="agree" value="terms" required> [필수] 대회 참가 규정 및 환불 규정에 동의합니다 <a href="#" onclick="return false">보기</a></label>
            <label><input type="checkbox" name="agree" value="privacy" required> [필수] 개인정보 수집·이용 및 주최 단체 제공에 동의합니다 <a href="#" onclick="return false">보기</a></label>
            <label><input type="checkbox" name="agree" value="media"> [선택] 대회 사진·영상 활용에 동의합니다</label>
            <label><input type="checkbox" name="agree" value="marketing"> [선택] 대회 소식 알림 수신에 동의합니다</label>
          </div>
          <p class="form-error" id="form-error"></p>
          <button type="submit" class="btn btn-primary btn-lg btn-block">${pre ? '사전 알림 신청하기' : '접수 신청하기'}</button>
          <p style="font-size:12px;color:#999;text-align:center">신청 후 접수번호가 발급되며, 참가비 입금 확인 후 접수가 확정돼요.</p>
        </div>
      </form>`;
    const form = document.getElementById('apply-form');
    const err = document.getElementById('form-error');
    document.getElementById('agree-all').addEventListener('change', (e) => {
      form.querySelectorAll('input[name=agree]').forEach((i) => (i.checked = e.target.checked));
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.classList.remove('show');
      const fd = new FormData(form);
      const categories = fd.getAll('categories');
      const agree = fd.getAll('agree');
      const showErr = (m) => {
        err.textContent = m;
        err.classList.add('show');
        err.scrollIntoView({ behavior: 'smooth', block: 'center' });
      };
      if (!fd.get('name') || !fd.get('birth') || !fd.get('gender') || !fd.get('phone') || !fd.get('career')) return showErr('필수 항목(이름, 생년월일, 성별, 휴대폰, 출전 경력)을 모두 입력해 주세요.');
      if (!/^01[016789]-?\d{3,4}-?\d{4}$/.test(fd.get('phone').trim())) return showErr('휴대폰 번호 형식을 확인해 주세요.');
      if (!categories.length) return showErr('출전 종목을 1개 이상 선택해 주세요.');
      if (!agree.includes('terms') || !agree.includes('privacy')) return showErr('필수 약관에 동의해 주세요.');
      const payload = {
        type: pre ? 'pre' : 'apply',
        competitionId: c.id,
        competitionName: c.name,
        competitionDate: c.date,
        org: o.name,
        name: fd.get('name').trim(),
        birth: fd.get('birth'),
        gender: fd.get('gender'),
        phone: fd.get('phone').trim(),
        email: (fd.get('email') || '').trim(),
        team: (fd.get('team') || '').trim(),
        career: fd.get('career'),
        categories,
        division: fd.get('division') || '',
        classInfo: (fd.get('classInfo') || '').trim(),
        height: fd.get('height') || '',
        weight: fd.get('weight') || '',
        memo: (fd.get('memo') || '').trim(),
        agree,
      };
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      btn.textContent = '전송 중...';
      try {
        const rec = await S.submitApplication(payload);
        wrap.innerHTML = `
          <div class="done-box">
            <div class="ok">✓</div>
            <h2>${pre ? '사전 알림 신청 완료' : '접수 신청이 완료됐어요'}</h2>
            <div class="code">${S.esc(rec.code)}</div>
            <p><b>${S.esc(c.name)}</b> · ${S.fmt(c.date)}<br>${S.esc(rec.name)} 님 · ${rec.categories.map(S.esc).join(', ')}</p>
            <p>${pre ? '접수가 시작되면 입력하신 번호로 안내 문자를 보내드려요.' : '입력하신 휴대폰으로 참가비 입금 안내가 발송돼요.<br>입금 확인 후 접수가 확정됩니다.'}${rec.synced ? '' : '<br><span style="color:#b45309;font-size:13px">※ 현재 접수 서버가 연결되지 않아 이 기기에만 저장됐어요. 운영 시 Worker 배포 후 API_BASE를 설정하세요.</span>'}</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><a class="btn btn-primary" href="${ROOT}my.html?tab=apps">신청 내역 보기</a><a class="btn btn-outline" href="${ROOT}prepare.html">대회 준비 가이드</a></div>
          </div>`;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (ex) {
        showErr(ex.message || '전송 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.');
        btn.disabled = false;
        btn.textContent = pre ? '사전 알림 신청하기' : '접수 신청하기';
      }
    });
  };

  pages.my = async () => {
    const data = await S.loadData();
    const tabs = document.querySelectorAll('.my-tabs button');
    const body = document.getElementById('my-body');
    let tab = S.qs('tab') === 'apps' ? 'apps' : 'saved';
    const render = () => {
      tabs.forEach((b) => b.classList.toggle('active', b.dataset.t === tab));
      if (tab === 'saved') {
        const list = S.saved().map(S.comp).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
        body.innerHTML = list.length
          ? list.map(S.compRow).join('')
          : `<div class="empty">저장한 대회가 없어요.<br><a href="${ROOT}competitions.html" style="color:#f26d6a;text-decoration:underline">대회 일정에서 ♡ 저장해 보세요</a></div>`;
      } else {
        const apps = S.apps();
        body.innerHTML = apps.length
          ? apps
              .map(
                (a) => `
            <div class="app-card">
              <div class="head"><h3>${S.esc(a.competitionName)}</h3><span class="app-status">${a.type === 'pre' ? '사전 알림' : a.synced ? '접수 확인 중' : '기기 저장'}</span></div>
              <dl>
                <dt>접수번호</dt><dd><b>${S.esc(a.code)}</b></dd>
                <dt>대회 일시</dt><dd>${S.fmt(a.competitionDate)}</dd>
                <dt>종목</dt><dd>${(a.categories || []).map(S.esc).join(', ')}${a.division ? ` · ${S.esc(a.division)}` : ''}</dd>
                <dt>신청자</dt><dd>${S.esc(a.name)} · ${S.esc(a.phone)}</dd>
                <dt>신청일</dt><dd>${new Date(a.createdAt).toLocaleString('ko-KR')}</dd>
              </dl>
              <a href="${ROOT}competition.html?id=${a.competitionId}" style="font-size:13px;color:#f26d6a;font-weight:600">대회 상세 보기 →</a>
            </div>`
              )
              .join('')
          : `<div class="empty">신청 내역이 없어요.<br><a href="${ROOT}competitions.html?status=open" style="color:#f26d6a;text-decoration:underline">접수 중인 대회 보기</a></div>`;
      }
    };
    tabs.forEach((b) =>
      b.addEventListener('click', () => {
        tab = b.dataset.t;
        render();
      })
    );
    render();
  };

  pages.prepare = async () => {
    // 체크리스트 저장
    const saved = S.LS.get('stageon_checklist', {});
    document.querySelectorAll('.check-card input[type=checkbox]').forEach((i) => {
      i.checked = !!saved[i.value];
      i.addEventListener('change', () => {
        saved[i.value] = i.checked;
        S.LS.set('stageon_checklist', saved);
        updateProgress();
      });
    });
    const updateProgress = () => {
      document.querySelectorAll('.check-card').forEach((card) => {
        const all = card.querySelectorAll('input');
        const done = card.querySelectorAll('input:checked');
        const p = card.querySelector('h3 span');
        if (p) p.textContent = `${done.length}/${all.length}`;
      });
    };
    updateProgress();
    // 루키 대회 추천
    try {
      const data = await S.loadData();
      const rookie = S.upcoming().filter((c) => c.types.includes('루키·노비스')).slice(0, 6);
      const el = document.getElementById('rookie-track');
      if (el) el.innerHTML = rookie.map(S.compCard).join('');
      const orgWrap = document.getElementById('org-cards');
      if (orgWrap) {
        orgWrap.innerHTML = data.organizations
          .map((o) => {
            const n = data.competitions.filter((c) => c.org === o.id && S.dday(c.date) >= 0).length;
            return `
            <div class="org-card">
              <div class="head"><span class="mark" style="background:${o.color}">${S.esc(o.name.slice(0, 2))}</span><h3>${S.esc(o.name)}<small>${S.esc(o.fullName || '')}</small></h3></div>
              <p>${S.esc(o.desc || '')}</p>
              <ul class="pts"><li>${o.natural ? '내추럴 단체 · 도핑/약물 규정 확인' : '오픈 단체 · 프로 루트 및 선수 등록 확인'}</li><li>종목별 복장·포징 규정 사전 확인</li></ul>
              <a class="cnt" href="${ROOT}competitions.html?org=${o.id}">예정 대회 ${n}개 보기 →</a>
            </div>`;
          })
          .join('');
      }
    } catch (e) {}
  };

  /* ---------- 부팅 ---------- */
  document.addEventListener('DOMContentLoaded', async () => {
    S.renderShell();
    const page = document.body.dataset.page;
    if (pages[page]) {
      try {
        await pages[page]();
      } catch (e) {
        console.error(e);
        const main = document.querySelector('main') || document.body;
        const box = document.createElement('div');
        box.className = 'empty';
        box.innerHTML = location.protocol === 'file:'
          ? '파일을 직접 열면 데이터(data/competitions.json)를 불러올 수 없어요.<br>로컬 서버로 실행하세요: <code>python -m http.server 8080</code> 후 http://localhost:8080 접속'
          : '데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
        main.prepend(box);
      }
    }
  });
})();

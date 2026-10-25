/* =====================================================
   스테이지온 공통 스크립트
   - 데이터 로드 / 상태 계산 / 공통 레이아웃 / 페이지별 초기화
   - 대회 접수, 준비 쇼핑(장바구니·주문), 커뮤니티(게시글·댓글)
   ===================================================== */
(function () {
  'use strict';

  // 접수·주문·커뮤니티 API (Cloudflare Worker) 주소. 비워두면 브라우저 저장(localStorage)만 사용.
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
    bank: '국민은행 000000-00-000000 (예금주: 스테이지온)',
  };

  const ROOT = '';
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
  S.won = (n) => S.num(n) + '원';
  S.ago = (iso) => {
    const t = new Date(iso).getTime();
    const diff = Date.now() - t;
    if (diff < 60000) return '방금 전';
    if (diff < 3600000) return Math.floor(diff / 60000) + '분 전';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '시간 전';
    if (diff < 86400000 * 30) return Math.floor(diff / 86400000) + '일 전';
    return new Date(iso).toLocaleDateString('ko-KR');
  };
  S.code = (prefix) => prefix + '-' + Date.now().toString(36).toUpperCase().slice(-6);

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
  let _products = null;
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
  S.loadProducts = async () => {
    if (_products) return _products;
    const res = await fetch(ROOT + 'data/products.json?v=' + Date.now());
    if (!res.ok) throw new Error('상품 데이터를 불러오지 못했습니다.');
    _products = await res.json();
    _products.catMap = {};
    _products.categories.forEach((c) => (_products.catMap[c.id] = c));
    _products.map = {};
    _products.products.forEach((p) => (_products.map[p.id] = p));
    return _products;
  };
  S.org = (id) => (_data && _data.orgMap[id]) || { id, name: id, color: '#444' };
  S.comp = (id) => _data && _data.competitions.find((c) => c.id === id);
  S.upcoming = () => _data.competitions.filter((c) => S.dday(c.date) >= 0);
  S.product = (id) => _products && _products.map[id];

  /* ---------- 저장소 ---------- */
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
  S.LS = LS;
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
  S.orders = () => LS.get('stageon_orders', []);
  S.addOrder = (o) => {
    const list = S.orders();
    list.unshift(o);
    LS.set('stageon_orders', list);
  };
  S.cart = () => LS.get('stageon_cart', []);
  S.setCart = (c) => {
    LS.set('stageon_cart', c);
    S.updateCartBadge();
  };
  S.addToCart = (id, option, qty) => {
    const cart = S.cart();
    const found = cart.find((x) => x.id === id && x.option === option);
    if (found) found.qty += qty;
    else cart.push({ id, option, qty });
    S.setCart(cart);
  };
  S.updateCartBadge = () => {
    const n = S.cart().reduce((a, x) => a + x.qty, 0);
    document.querySelectorAll('[data-cart-count]').forEach((el) => {
      el.textContent = n;
      el.style.display = n ? '' : 'none';
    });
  };

  /* ---------- API 호출 ---------- */
  S.api = async (path, opts) => {
    if (!API_BASE) throw new Error('NO_API');
    const res = await fetch(API_BASE.replace(/\/$/, '') + path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {}));
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) throw new Error(json.error || '서버 오류가 발생했습니다.');
    return json;
  };

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

  /* ---------- 모달 ---------- */
  S.modal = (html, opts) => {
    let wrap = document.getElementById('so-modal');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'so-modal';
      wrap.className = 'so-modal';
      document.body.appendChild(wrap);
      wrap.addEventListener('click', (e) => {
        if (e.target === wrap || e.target.closest('[data-close]')) S.closeModal();
      });
    }
    wrap.innerHTML = `<div class="so-modal-box ${(opts && opts.cls) || ''}"><button class="so-modal-x" data-close aria-label="닫기">×</button>${html}</div>`;
    wrap.classList.add('open');
    document.body.style.overflow = 'hidden';
    return wrap.querySelector('.so-modal-box');
  };
  S.closeModal = () => {
    const wrap = document.getElementById('so-modal');
    if (wrap) wrap.classList.remove('open');
    document.body.style.overflow = '';
  };

  /* ---------- 공통 레이아웃 ---------- */
  const NAV = [
    ['competitions.html', '대회 일정', 'competitions'],
    ['prepare.html', '대회 준비', 'prepare'],
    ['community.html', '커뮤니티', 'community'],
    ['my.html', '내 대회', 'my'],
    ['guide.html', '준비 가이드', 'guide'],
    ['index.html#faq', '자주하는 질문', 'faq'],
  ];
  S.renderShell = () => {
    const page = document.body.dataset.page || '';
    const head = document.getElementById('site-header');
    if (head) {
      const link = ([href, label, key]) => `<a href="${ROOT}${href}" class="${page === key ? 'active' : ''}">${label}</a>`;
      head.innerHTML = `
        <header class="ld-header">
          <div class="ld-header-inner">
            <div class="ld-header-left">
              <a href="${ROOT}index.html" class="ld-header-logo">${SITE.name}<span class="dot"></span></a>
              <nav class="ld-header-nav">
                ${NAV.slice(0, 4).map(link).join('')}
                <span class="ld-header-divider"></span>
                ${NAV.slice(4).map(link).join('')}
              </nav>
            </div>
            <div class="ld-header-right">
              <a href="${ROOT}prepare.html?cart=1" class="ld-header-cta cart-btn" aria-label="장바구니"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h2l2.4 12.4a2 2 0 002 1.6h8.8a2 2 0 002-1.6L22 7H6"/><circle cx="9" cy="21" r="1.5"/><circle cx="18" cy="21" r="1.5"/></svg><span class="cart-count" data-cart-count style="display:none">0</span></a>
              <a href="${ROOT}competitions.html?status=open" class="ld-header-cta primary">대회 신청</a>
              <button class="ld-menu-btn" aria-label="메뉴" data-menu><span></span></button>
            </div>
          </div>
          <nav class="ld-mobile-nav" data-mobile-nav>${NAV.map(link).join('')}</nav>
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
                <div class="ld-footer-links"><span>이용약관</span><i></i><b>개인정보처리방침</b><i></i><span>대회 등록 요청</span><i></i><span>입점 문의</span></div>
                <div class="ld-footer-info" style="margin-top:20px">
                  <b>${SITE.company}</b>&nbsp; 대표 : ${SITE.ceo} &nbsp; 사업자등록번호 : ${SITE.bizNo}<br>
                  주소 : ${SITE.address}<br>
                  메일 : ${SITE.email}
                </div>
                <div class="ld-footer-info" style="margin-top:16px">© ${SITE.name}. 대회 정보와 포스터는 각 주최 단체(운동의모든것, NPC/IFBB Pro Korea, NABBA Korea, 모델라인 컴퍼니)의 공식 공지를 기준으로 하며 저작권은 각 단체에 있습니다.</div>
              </div>
              <div class="ld-footer-contact"><small>대회·주문 문의 (평일 10:00~18:00)</small><strong>${SITE.phone}</strong></div>
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
    S.updateCartBadge();
  };

  /* ---------- 카드 렌더러 ---------- */
  S.chips = (arr, max) => {
    const list = arr.slice(0, max);
    const rest = arr.length - list.length;
    return `<div class="chips">${list.map((x) => `<span>${S.esc(x)}</span>`).join('')}${rest > 0 ? `<span class="more">+${rest}</span>` : ''}</div>`;
  };
  const posterStyle = (c, o) =>
    c.poster
      ? `background-image:linear-gradient(to top, rgba(10,12,16,.85) 0%, rgba(10,12,16,.15) 55%, rgba(10,12,16,0) 100%), url('${ROOT}${c.poster}');background-size:cover;background-position:center top`
      : `background:linear-gradient(135deg, ${o.color} 0%, #1d2124 130%)`;
  S.compCard = (c) => {
    const o = S.org(c.org);
    const st = S.statusShort(c);
    const d = S.parse(c.date);
    return `
      <a class="comp-card" href="${ROOT}competition.html?id=${c.id}">
        <div class="comp-card-poster ${c.poster ? 'has-img' : ''}" style="${posterStyle(c, o)}">
          <span class="org-mark" style="background:${o.color}">${S.esc(o.name)}</span>
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
        ${c.poster ? `<div class="row-thumb" style="background-image:url('${ROOT}${c.poster}')"></div>` : ''}
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
        <div class="reco-card-img ${c.poster ? 'has-img' : ''}" style="${c.poster ? `background-image:url('${ROOT}${c.poster}');background-size:cover;background-position:center top` : `background:linear-gradient(160deg, ${o.color} 0%, #1d2124 140%)`}">
          ${c.poster ? '' : `<span class="big">${S.esc(o.name.split('/')[0].split(' ')[0])}</span>`}
          <span class="date">${S.fmt(c.date, 'short')}</span>
          <span class="dday">${S.ddayLabel(c.date)}</span>
        </div>
        <div class="reco-card-meta"><h4>${S.esc(c.name)}</h4><span class="tag">${S.esc(c.types[0] || '')}</span></div>
        <div class="reco-card-region">${S.esc(c.region)} · ${S.esc(c.venue)}</div>
      </a>`;
  };
  S.productCard = (p) => {
    const cat = _products.catMap[p.category] || { color: '#444', icon: '' };
    return `
      <a class="product-card" href="${ROOT}prepare.html?p=${p.id}" data-product="${p.id}">
        <div class="product-img" style="background:linear-gradient(160deg, ${cat.color} 0%, #1d2124 150%)">
          <span class="emoji">${cat.icon}</span>
          ${p.badge ? `<span class="pbadge ${p.badge.toLowerCase()}">${p.badge}</span>` : ''}
          <span class="ptype">${p.type === 'service' ? '서비스' : '상품'}</span>
        </div>
        <div class="product-body">
          <div class="vendor">${S.esc(p.vendor)}</div>
          <h4>${S.esc(p.name)}</h4>
          <div class="price"><b>${S.won(p.price)}</b><small> / ${S.esc(p.unit)}</small></div>
          <div class="ptags">${p.tags.slice(0, 3).map((t) => `<span>${S.esc(t)}</span>`).join('')}</div>
        </div>
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

  /* ---------- 접수 / 주문 전송 ---------- */
  S.submitApplication = async (payload) => {
    const record = Object.assign({ code: S.code('SO'), createdAt: new Date().toISOString(), synced: false }, payload);
    if (API_BASE) {
      const json = await S.api('/api/apply', { method: 'POST', body: JSON.stringify(record) });
      record.code = json.code || record.code;
      record.synced = true;
    }
    S.addApp(record);
    return record;
  };
  S.submitOrder = async (payload) => {
    const record = Object.assign({ code: S.code('ORD'), createdAt: new Date().toISOString(), synced: false, status: '입금 대기' }, payload);
    if (API_BASE) {
      const json = await S.api('/api/order', { method: 'POST', body: JSON.stringify(record) });
      record.code = json.code || record.code;
      record.synced = true;
    }
    S.addOrder(record);
    return record;
  };

  /* =====================================================
     페이지별 초기화
     ===================================================== */
  const pages = {};

  /* ---------- 홈 ---------- */
  pages.home = async () => {
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

    document.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b === btn));
        document.querySelectorAll('[data-tab-panel]').forEach((p) => (p.hidden = p.dataset.tabPanel !== btn.dataset.tab));
      });
    });

    const [data, prod] = await Promise.all([S.loadData(), S.loadProducts().catch(() => null)]);
    const up = S.upcoming();

    const track = document.getElementById('upcoming-track');
    track.innerHTML = up.slice(0, 12).map(S.compCard).join('');
    document.getElementById('upcoming-count').textContent = up.length;

    // 히어로 포스터 콜라주
    const collage = document.getElementById('hero-collage');
    if (collage) {
      const withPoster = up.filter((c) => c.poster && !c.poster.includes('generic')).slice(0, 4);
      collage.innerHTML = withPoster.map((c) => `<a href="${ROOT}competition.html?id=${c.id}" class="hc-item" style="background-image:url('${ROOT}${c.poster}')" title="${S.esc(c.name)}"></a>`).join('');
    }

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
    let html = orgOrder
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
    if (prod) {
      const best = prod.products.filter((p) => p.badge === 'BEST').slice(0, 8);
      html += `
        <div class="ld-reco-row">
          <div class="ld-reco-title"><span class="ico" style="background:#f26d6a">★</span>대회 준비 BEST<small>포징·레슨·식단·촬영</small>
            <a href="${ROOT}prepare.html" class="ld-upcoming-more">준비 쇼핑 전체 →</a></div>
          <div class="ld-track">${best.map(S.productCard).join('')}</div>
        </div>`;
    }
    recoWrap.innerHTML = html;

    // 대회 소식 탭: 포스터가 있는 예정 대회
    const news = document.getElementById('news-grid');
    if (news) {
      const list = up.filter((c) => c.poster).slice(0, 4);
      news.innerHTML = list
        .map(
          (c) => `
        <a class="article-card" href="${ROOT}competition.html?id=${c.id}">
          <div class="thumb img" style="background-image:url('${ROOT}${c.poster}')"><span>${S.esc(S.org(c.org).name)}<br>${S.fmt(c.date, 'short')}</span></div>
          <h3>${S.esc(c.name)}</h3>
          <p>${S.esc(c.venue)} · ${S.esc(c.desc || '')}</p>
          <div class="meta"><span class="on">${S.statusShort(c).label}</span><span>${S.ddayLabel(c.date)}</span></div>
        </a>`
        )
        .join('');
    }
  };

  /* ---------- 대회 목록 ---------- */
  pages.competitions = async () => {
    const data = await S.loadData();
    const comps = data.competitions;
    const state = { q: '', org: new Set(), region: new Set(), cat: new Set(), type: new Set(), status: new Set(), sort: 'date', past: false };
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
    if (S.qs('past') === '1') state.past = true;

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
          ${items.map(([v, label]) => `<label><input type="checkbox" data-f="${key}" value="${S.esc(v)}" ${state[key].has(v) ? 'checked' : ''}> ${S.esc(label)}<span class="n">${countOf(key, v)}</span></label>`).join('')}
        </div>`
        )
        .join('') +
      `<div class="filter-group"><label><input type="checkbox" data-f="past" ${state.past ? 'checked' : ''}> 지난 대회 포함</label></div>
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
        list = list.slice().sort((a, b) => (a.applyEnd || '9999-12-31').localeCompare(b.applyEnd || '9999-12-31'));
      }
      document.getElementById('count').innerHTML = `총 <b>${list.length}</b>개 대회`;
      const main = document.getElementById('list-main');
      if (!list.length) {
        main.innerHTML = '<div class="empty">조건에 맞는 대회가 없어요.<br>필터를 조정하거나 "지난 대회 포함"을 켜 보세요.</div>';
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

  /* ---------- 대회 상세 ---------- */
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
    const posterBig = c.posterFull || c.poster;
    root.innerHTML = `
      <section class="detail-hero ${c.poster ? 'has-img' : ''}" style="${c.poster ? `background-image:url('${ROOT}${c.poster}')` : `background:linear-gradient(135deg, ${o.color} 0%, #1d2124 130%)`}">
        <div class="inner">
          ${c.poster ? `<a class="detail-poster" href="${ROOT}${posterBig}" target="_blank" rel="noopener" title="포스터 크게 보기"><img src="${ROOT}${c.poster}" alt="${S.esc(c.name)} 포스터"></a>` : ''}
          <div class="detail-hero-text">
            <div class="top"><span class="org-badge" style="background:rgba(255,255,255,.2)">${S.esc(o.name)}</span>${c.types.map((t) => `<span class="org-badge" style="background:rgba(0,0,0,.3)">${S.esc(t)}</span>`).join('')}<span class="dday-big">${S.ddayLabel(c.date)}</span></div>
            <h1>${S.esc(c.name)}</h1>
            <div class="date-line">${S.fmt(c.date)} · ${S.esc(c.region)} ${S.esc(c.venue)}</div>
          </div>
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
              <div><dt>접수 방식</dt><dd>${c.applyMode === 'external' ? '주최 단체 공식 사이트 접수' : `${SITE.name} 온라인 접수 (주최 단체에 전달)`}</dd></div>
              ${c.officialUrl ? `<div><dt>공식 페이지</dt><dd><a href="${S.esc(c.officialUrl)}" target="_blank" rel="noopener">${S.esc(c.officialUrl)}</a></dd></div>` : ''}
            </dl>
          </div>
          <div>
            <h2 class="section-h">종목</h2>
            <div class="cat-list">${c.categories.map((x) => `<span>${S.esc(x)}</span>`).join('')}</div>
          </div>
          <div>
            <h2 class="section-h">대회 소개</h2>
            <p class="desc-box">${S.esc(c.desc || '상세 내용은 주최 단체 공식 페이지를 확인하세요.')}</p>
            <p class="notice-bar" style="margin-top:16px">${S.esc(data.notice)}</p>
          </div>
          ${posterBig ? `<div><h2 class="section-h">대회 포스터</h2><a href="${ROOT}${posterBig}" target="_blank" rel="noopener" class="poster-full"><img src="${ROOT}${posterBig}" alt="${S.esc(c.name)} 포스터" loading="lazy"></a><p style="font-size:12px;color:#999;margin-top:8px">포스터 출처: ${S.esc(o.name)} 공식 페이지</p></div>` : ''}
          <div>
            <h2 class="section-h">주최 단체 안내</h2>
            <div class="org-card">
              <div class="head"><span class="mark" style="background:${o.color}">${S.esc(o.name.slice(0, 2))}</span><h3>${S.esc(o.name)}<small>${S.esc(o.fullName || '')}</small></h3></div>
              <p>${S.esc(o.desc || '')}</p>
              <a class="cnt" href="${ROOT}guide.html#orgs">단체별 출전 가이드 보기 →</a>
            </div>
          </div>
          <div>
            <h2 class="section-h">이 대회 준비하기</h2>
            <div class="ld-track" id="detail-products" style="padding-left:0;padding-right:0"></div>
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
            <a class="btn btn-outline btn-block" href="${ROOT}community.html?comp=${c.id}">💬 이 대회 이야기 나누기</a>
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
    try {
      const prod = await S.loadProducts();
      const picks = ['posing-1on1-4', 'dayof-tanning', 'vid-stage-basic', 'bp-stage-day', 'coach-peak', 'gear-band'].map((id) => prod.map[id]).filter(Boolean);
      document.getElementById('detail-products').innerHTML = picks.map(S.productCard).join('');
    } catch (e) {}
  };

  /* ---------- 접수 폼 ---------- */
  pages.apply = async () => {
    await S.loadData();
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
        ${c.poster ? `<div class="mark img" style="background-image:url('${ROOT}${c.poster}')"></div>` : `<div class="mark" style="background:${o.color}">${S.esc(o.name.slice(0, 4))}</div>`}
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
              <select name="division"><option value="">선택 (해당 시)</option><option>비기너 (첫 출전)</option><option>노비스</option><option>오픈</option><option>AGE (마스터즈)</option><option>중·고등부</option><option>장애인부</option></select></div>
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
        competitionId: c.id, competitionName: c.name, competitionDate: c.date, org: o.name,
        name: fd.get('name').trim(), birth: fd.get('birth'), gender: fd.get('gender'), phone: fd.get('phone').trim(),
        email: (fd.get('email') || '').trim(), team: (fd.get('team') || '').trim(), career: fd.get('career'),
        categories, division: fd.get('division') || '', classInfo: (fd.get('classInfo') || '').trim(),
        height: fd.get('height') || '', weight: fd.get('weight') || '', memo: (fd.get('memo') || '').trim(), agree,
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
            <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><a class="btn btn-primary" href="${ROOT}my.html?tab=apps">신청 내역 보기</a><a class="btn btn-outline" href="${ROOT}prepare.html">대회 준비 쇼핑</a></div>
          </div>`;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (ex) {
        showErr(ex.message === 'NO_API' ? '접수 서버가 연결되지 않았어요.' : ex.message || '전송 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.');
        btn.disabled = false;
        btn.textContent = pre ? '사전 알림 신청하기' : '접수 신청하기';
      }
    });
  };

  /* ---------- 내 대회 ---------- */
  pages.my = async () => {
    await S.loadData();
    await S.loadProducts().catch(() => null);
    const tabs = document.querySelectorAll('.my-tabs button');
    const body = document.getElementById('my-body');
    const valid = ['saved', 'apps', 'orders'];
    let tab = valid.includes(S.qs('tab')) ? S.qs('tab') : 'saved';
    const render = () => {
      tabs.forEach((b) => b.classList.toggle('active', b.dataset.t === tab));
      if (tab === 'saved') {
        const list = S.saved().map(S.comp).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
        body.innerHTML = list.length ? list.map(S.compRow).join('') : `<div class="empty">저장한 대회가 없어요.<br><a href="${ROOT}competitions.html" style="color:#f26d6a;text-decoration:underline">대회 일정에서 ♡ 저장해 보세요</a></div>`;
      } else if (tab === 'apps') {
        const apps = S.apps();
        body.innerHTML = apps.length
          ? apps.map((a) => `
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
            </div>`).join('')
          : `<div class="empty">신청 내역이 없어요.<br><a href="${ROOT}competitions.html?status=open" style="color:#f26d6a;text-decoration:underline">접수 중인 대회 보기</a></div>`;
      } else {
        const orders = S.orders();
        body.innerHTML = orders.length
          ? orders.map((o) => `
            <div class="app-card">
              <div class="head"><h3>주문 ${S.esc(o.code)}</h3><span class="app-status">${S.esc(o.status || '입금 대기')}${o.synced ? '' : ' · 기기 저장'}</span></div>
              <dl>
                <dt>상품</dt><dd>${o.items.map((it) => `${S.esc(it.name)}${it.option ? ` (${S.esc(it.option)})` : ''} × ${it.qty}`).join('<br>')}</dd>
                <dt>결제 금액</dt><dd><b>${S.won(o.total)}</b> · 무통장 입금</dd>
                <dt>입금 계좌</dt><dd>${S.esc(SITE.bank)}</dd>
                <dt>주문자</dt><dd>${S.esc(o.buyer.name)} · ${S.esc(o.buyer.phone)}</dd>
                <dt>주문일</dt><dd>${new Date(o.createdAt).toLocaleString('ko-KR')}</dd>
              </dl>
            </div>`).join('')
          : `<div class="empty">주문 내역이 없어요.<br><a href="${ROOT}prepare.html" style="color:#f26d6a;text-decoration:underline">대회 준비 쇼핑 보기</a></div>`;
      }
    };
    tabs.forEach((b) => b.addEventListener('click', () => { tab = b.dataset.t; render(); }));
    render();
  };

  /* ---------- 준비 가이드 (구 prepare) ---------- */
  pages.guide = async () => {
    const saved = LS.get('stageon_checklist', {});
    const updateProgress = () => {
      document.querySelectorAll('.check-card').forEach((card) => {
        const all = card.querySelectorAll('input');
        const done = card.querySelectorAll('input:checked');
        const p = card.querySelector('h3 span');
        if (p) p.textContent = `${done.length}/${all.length}`;
      });
    };
    document.querySelectorAll('.check-card input[type=checkbox]').forEach((i) => {
      i.checked = !!saved[i.value];
      i.addEventListener('change', () => {
        saved[i.value] = i.checked;
        LS.set('stageon_checklist', saved);
        updateProgress();
      });
    });
    updateProgress();
    try {
      const data = await S.loadData();
      const rookie = S.upcoming().filter((c) => c.types.includes('루키·노비스')).slice(0, 6);
      const el = document.getElementById('rookie-track');
      if (el) el.innerHTML = rookie.map(S.compCard).join('');
      const orgWrap = document.getElementById('org-cards');
      if (orgWrap) {
        orgWrap.innerHTML = data.organizations.map((o) => {
          const n = data.competitions.filter((c) => c.org === o.id && S.dday(c.date) >= 0).length;
          return `
            <div class="org-card">
              <div class="head"><span class="mark" style="background:${o.color}">${S.esc(o.name.slice(0, 2))}</span><h3>${S.esc(o.name)}<small>${S.esc(o.fullName || '')}</small></h3></div>
              <p>${S.esc(o.desc || '')}</p>
              <ul class="pts"><li>${o.natural ? '내추럴 단체 · 도핑/약물 규정 확인' : '오픈 단체 · 프로 루트 및 선수 등록 확인'}</li><li>종목별 복장·포징 규정 사전 확인</li></ul>
              <a class="cnt" href="${ROOT}competitions.html?org=${o.id}&past=1">대회 ${n}개 예정 · 전체 보기 →</a>
            </div>`;
        }).join('');
      }
    } catch (e) {}
  };

  /* ---------- 대회 준비 쇼핑 ---------- */
  pages.prepare = async () => {
    const prod = await S.loadProducts();
    const grid = document.getElementById('product-grid');
    const catWrap = document.getElementById('cat-chips');
    const countEl = document.getElementById('product-count');
    const qInput = document.getElementById('pq');
    let cat = S.qs('cat') || 'all';
    let q = '';

    catWrap.innerHTML =
      `<button data-cat="all" class="${cat === 'all' ? 'active' : ''}">전체</button>` +
      prod.categories.map((c) => `<button data-cat="${c.id}" class="${cat === c.id ? 'active' : ''}">${c.icon} ${S.esc(c.name)}</button>`).join('');

    // 카테고리 안내 카드
    const catGrid = document.getElementById('cat-grid');
    if (catGrid) {
      catGrid.innerHTML = prod.categories.map((c) => `
        <button class="cat-card" data-cat="${c.id}" style="--c:${c.color}">
          <span class="ci">${c.icon}</span>
          <b>${S.esc(c.name)}</b>
          <small>${S.esc(c.desc)}</small>
          <em>${prod.products.filter((p) => p.category === c.id).length}개 상품</em>
        </button>`).join('');
    }

    // 패키지
    const bundleEl = document.getElementById('bundle');
    const b = prod.bundle;
    if (bundleEl && b) {
      const items = b.items.map((id) => prod.map[id]).filter(Boolean);
      bundleEl.innerHTML = `
        <div class="bundle-text">
          <span class="ld-situation-badge" style="background:#fff">첫 출전 추천</span>
          <h2>${S.esc(b.name)}</h2>
          <p>${S.esc(b.desc)}</p>
          <div class="bundle-items">${items.map((p) => `<span>${prod.catMap[p.category].icon} ${S.esc(p.name)}</span>`).join('')}</div>
          <div class="ld-card-tags" style="padding:0"><div class="ld-card-tag-group">${b.tags.map((t) => `<span>${S.esc(t)}</span>`).join('')}</div></div>
        </div>
        <div class="bundle-price">
          <small>정가 <s>${S.won(b.originalPrice)}</s></small>
          <b>${S.won(b.price)}</b>
          <button class="btn btn-primary btn-lg" data-bundle>패키지 담기</button>
          <span class="hint">레슨·태닝 지역은 주문 시 선택</span>
        </div>`;
      bundleEl.querySelector('[data-bundle]').addEventListener('click', () => {
        b.items.forEach((id) => S.addToCart(id, '', 1));
        S.toast('패키지 구성품 4개를 장바구니에 담았어요');
        openCart();
      });
    }

    const render = () => {
      const list = prod.products.filter((p) => (cat === 'all' || p.category === cat) && (!q || [p.name, p.vendor, p.desc, ...p.tags].join(' ').toLowerCase().includes(q)));
      countEl.innerHTML = `<b>${list.length}</b>개`;
      grid.innerHTML = list.length ? list.map(S.productCard).join('') : '<div class="empty">조건에 맞는 상품이 없어요.</div>';
      catWrap.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x.dataset.cat === cat));
      const info = document.getElementById('cat-info');
      if (info) {
        const c = prod.catMap[cat];
        info.innerHTML = c ? `<h2>${c.icon} ${S.esc(c.name)}</h2><p>${S.esc(c.desc)}</p>` : '<h2>전체 상품</h2><p>대회 준비에 필요한 레슨·식단·보충제·용품·촬영 서비스를 한곳에 모았어요.</p>';
      }
    };
    document.addEventListener('click', (e) => {
      const cb = e.target.closest('[data-cat]');
      if (cb) {
        cat = cb.dataset.cat;
        render();
        document.getElementById('shop-top').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    qInput.addEventListener('input', () => {
      q = qInput.value.trim().toLowerCase();
      render();
    });

    // 상품 상세 모달
    const openProduct = (id) => {
      const p = prod.map[id];
      if (!p) return;
      const c = prod.catMap[p.category];
      const box = S.modal(`
        <div class="pd">
          <div class="pd-img" style="background:linear-gradient(160deg, ${c.color} 0%, #1d2124 150%)"><span>${c.icon}</span>${p.badge ? `<em class="pbadge ${p.badge.toLowerCase()}">${p.badge}</em>` : ''}</div>
          <div class="pd-body">
            <div class="vendor">${S.esc(c.name)} · ${S.esc(p.vendor)}</div>
            <h2>${S.esc(p.name)}</h2>
            <div class="price"><b>${S.won(p.price)}</b><small> / ${S.esc(p.unit)}</small></div>
            <p class="desc">${S.esc(p.desc)}</p>
            <div class="ptags">${p.tags.map((t) => `<span>${S.esc(t)}</span>`).join('')}</div>
            ${p.options && p.options.length ? `<div class="field"><label>${S.esc(p.optionLabel || '옵션')}<em>*</em></label><select id="pd-opt"><option value="">선택하세요</option>${p.options.map((o) => `<option>${S.esc(o)}</option>`).join('')}</select></div>` : ''}
            <div class="field"><label>수량</label><div class="qty"><button type="button" data-q="-1">−</button><input id="pd-qty" type="number" min="1" max="20" value="1"><button type="button" data-q="1">+</button></div></div>
            <div class="pd-actions"><button class="btn btn-outline btn-lg" data-add>장바구니 담기</button><button class="btn btn-primary btn-lg" data-buy>${p.type === 'service' ? '바로 신청' : '바로 구매'}</button></div>
            <p class="note">${p.type === 'service' ? '신청 후 담당자가 일정 조율 연락을 드려요. 결제는 무통장 입금(일정 확정 후)으로 진행돼요.' : '무통장 입금 확인 후 배송돼요. 평일 14시 이전 입금 시 당일 출고.'}</p>
          </div>
        </div>`, { cls: 'wide' });
      const qty = box.querySelector('#pd-qty');
      box.querySelectorAll('[data-q]').forEach((bt) => bt.addEventListener('click', () => (qty.value = Math.max(1, Math.min(20, Number(qty.value) + Number(bt.dataset.q))))));
      const pick = () => {
        const sel = box.querySelector('#pd-opt');
        if (sel && !sel.value) {
          S.toast((p.optionLabel || '옵션') + '을(를) 선택해 주세요');
          sel.focus();
          return null;
        }
        return { option: sel ? sel.value : '', qty: Number(qty.value) || 1 };
      };
      box.querySelector('[data-add]').addEventListener('click', () => {
        const v = pick();
        if (!v) return;
        S.addToCart(p.id, v.option, v.qty);
        S.toast('장바구니에 담았어요');
        S.closeModal();
      });
      box.querySelector('[data-buy]').addEventListener('click', () => {
        const v = pick();
        if (!v) return;
        S.addToCart(p.id, v.option, v.qty);
        S.closeModal();
        openCart();
      });
    };
    document.addEventListener('click', (e) => {
      const a = e.target.closest('[data-product]');
      if (a) {
        e.preventDefault();
        openProduct(a.dataset.product);
      }
    });

    // 장바구니 드로어
    const drawer = document.getElementById('cart-drawer');
    const renderCart = () => {
      const cart = S.cart();
      const body = drawer.querySelector('.cart-body');
      const total = cart.reduce((a, x) => a + (prod.map[x.id] ? prod.map[x.id].price * x.qty : 0), 0);
      body.innerHTML = cart.length
        ? cart.map((x, i) => {
            const p = prod.map[x.id];
            if (!p) return '';
            return `<div class="cart-item">
              <div class="ci-ico" style="background:${prod.catMap[p.category].color}">${prod.catMap[p.category].icon}</div>
              <div class="ci-info"><b>${S.esc(p.name)}</b><small>${x.option ? S.esc(x.option) + ' · ' : ''}${S.won(p.price)} × ${x.qty}</small></div>
              <div class="ci-right"><b>${S.won(p.price * x.qty)}</b><button data-rm="${i}" aria-label="삭제">×</button></div>
            </div>`;
          }).join('')
        : '<div class="empty">장바구니가 비어 있어요.</div>';
      drawer.querySelector('.cart-total b').textContent = S.won(total);
      drawer.querySelector('[data-checkout]').disabled = !cart.length;
      body.querySelectorAll('[data-rm]').forEach((bt) => bt.addEventListener('click', () => {
        const c = S.cart();
        c.splice(Number(bt.dataset.rm), 1);
        S.setCart(c);
        renderCart();
      }));
    };
    const openCart = () => {
      renderCart();
      drawer.classList.add('open');
      document.body.style.overflow = 'hidden';
    };
    const closeCart = () => {
      drawer.classList.remove('open');
      document.body.style.overflow = '';
    };
    drawer.querySelectorAll('[data-cart-close]').forEach((x) => x.addEventListener('click', closeCart));
    document.getElementById('open-cart').addEventListener('click', openCart);
    document.addEventListener('click', (e) => {
      if (e.target.closest('.cart-btn')) {
        e.preventDefault();
        openCart();
      }
    });

    // 주문 폼
    drawer.querySelector('[data-checkout]').addEventListener('click', () => {
      const cart = S.cart();
      const items = cart.map((x) => ({ id: x.id, name: prod.map[x.id].name, option: x.option, qty: x.qty, price: prod.map[x.id].price, type: prod.map[x.id].type }));
      const total = items.reduce((a, x) => a + x.price * x.qty, 0);
      const hasProduct = items.some((x) => x.type === 'product');
      const hasService = items.some((x) => x.type === 'service');
      closeCart();
      const box = S.modal(`
        <form id="order-form" class="order-form" novalidate>
          <h2>주문 / 신청</h2>
          <div class="order-sum">${items.map((x) => `<div><span>${S.esc(x.name)}${x.option ? ` (${S.esc(x.option)})` : ''} × ${x.qty}</span><b>${S.won(x.price * x.qty)}</b></div>`).join('')}<div class="tot"><span>합계</span><b>${S.won(total)}</b></div></div>
          <div class="field-row">
            <div class="field"><label>이름<em>*</em></label><input name="name" required autocomplete="name"></div>
            <div class="field"><label>휴대폰<em>*</em></label><input name="phone" type="tel" required placeholder="010-0000-0000" autocomplete="tel"></div>
          </div>
          <div class="field"><label>이메일</label><input name="email" type="email" autocomplete="email"></div>
          ${hasProduct ? `<div class="field"><label>배송 주소<em>*</em></label><input name="address" required placeholder="도로명 주소, 상세 주소" autocomplete="street-address"></div>` : ''}
          ${hasService ? `<div class="field-row"><div class="field"><label>출전 예정 대회</label><input name="competition" placeholder="예: WNGP 양주 (10/31)"></div><div class="field"><label>희망 일정</label><input name="schedule" placeholder="예: 11월 첫째 주 평일 저녁"></div></div>` : ''}
          <div class="field"><label>요청 사항</label><textarea name="memo" rows="2"></textarea></div>
          <div class="agree-box">
            <label><input type="checkbox" name="agree" value="terms" required> [필수] 구매·환불 규정 및 개인정보 제공(제휴 업체)에 동의합니다</label>
          </div>
          <p class="note">결제 방법: 무통장 입금 · ${S.esc(SITE.bank)}<br>주문 후 입금 안내 문자가 발송되며, 입금 확인 후 배송/일정 조율이 시작돼요.</p>
          <p class="form-error" id="order-error"></p>
          <button type="submit" class="btn btn-primary btn-lg btn-block">${S.won(total)} 주문하기</button>
        </form>`, { cls: 'wide' });
      const form = box.querySelector('#order-form');
      const err = box.querySelector('#order-error');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const showErr = (m) => { err.textContent = m; err.classList.add('show'); };
        err.classList.remove('show');
        if (!fd.get('name') || !fd.get('phone')) return showErr('이름과 휴대폰 번호를 입력해 주세요.');
        if (!/^01[016789]-?\d{3,4}-?\d{4}$/.test(fd.get('phone').trim())) return showErr('휴대폰 번호 형식을 확인해 주세요.');
        if (hasProduct && !fd.get('address')) return showErr('배송 주소를 입력해 주세요.');
        if (!fd.get('agree')) return showErr('필수 약관에 동의해 주세요.');
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true;
        btn.textContent = '전송 중...';
        try {
          const rec = await S.submitOrder({
            items, total,
            buyer: { name: fd.get('name').trim(), phone: fd.get('phone').trim(), email: (fd.get('email') || '').trim(), address: (fd.get('address') || '').trim() },
            competition: (fd.get('competition') || '').trim(), schedule: (fd.get('schedule') || '').trim(), memo: (fd.get('memo') || '').trim(),
          });
          S.setCart([]);
          box.innerHTML = `<div class="done-box"><div class="ok">✓</div><h2>주문이 접수됐어요</h2><div class="code">${S.esc(rec.code)}</div>
            <p>합계 <b>${S.won(total)}</b> · 무통장 입금<br>${S.esc(SITE.bank)}<br>입금 확인 후 배송 및 일정 조율 연락을 드려요.${rec.synced ? '' : '<br><span style="color:#b45309;font-size:13px">※ 주문 서버가 연결되지 않아 이 기기에만 저장됐어요.</span>'}</p>
            <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><a class="btn btn-primary" href="${ROOT}my.html?tab=orders">주문 내역 보기</a><button class="btn btn-outline" data-close>계속 쇼핑하기</button></div></div>`;
        } catch (ex) {
          showErr(ex.message === 'NO_API' ? '주문 서버가 연결되지 않았어요.' : ex.message);
          btn.disabled = false;
          btn.textContent = `${S.won(total)} 주문하기`;
        }
      });
    });

    render();
    if (S.qs('p')) openProduct(S.qs('p'));
    if (S.qs('cart') === '1') openCart();
  };

  /* ---------- 커뮤니티 ---------- */
  const CATS = [
    ['free', '자유', '#626270'],
    ['review', '대회 후기', '#f26d6a'],
    ['qna', '질문', '#3b6fe0'],
    ['diet', '식단·운동', '#1a9f5c'],
    ['posing', '포징·의상', '#7c3aed'],
    ['market', '중고·나눔', '#c2410c'],
    ['mate', '대회 메이트', '#0f766e'],
  ];
  const CAT = Object.fromEntries(CATS.map(([id, name, color]) => [id, { id, name, color }]));
  const SEED_POSTS = [
    { id: 'p1', category: 'review', title: 'WNGP 수원 첫 출전 후기 (노비스 맨즈 피지크)', nickname: '첫무대', body: '생애 첫 대회 다녀왔어요. 계측은 생각보다 빨리 끝났고, 백스테이지가 추우니 큰 수건이랑 가운 꼭 챙기세요. 펌핑은 밴드로 충분했습니다. 태닝은 전날 1차 + 당일 보정 조합이 정답이었어요.', createdAt: '2026-04-02T10:12:00+09:00', views: 412, comments: [{ nickname: '비키니준비중', body: '축하드려요! 태닝은 어디서 하셨어요?', createdAt: '2026-04-02T12:00:00+09:00' }, { nickname: '첫무대', body: '수원역 근처 스튜디오요. 대회장 근처라 당일 보정도 편했어요.', createdAt: '2026-04-02T13:10:00+09:00' }] },
    { id: 'p2', category: 'qna', title: '비키니 vs 웰니스 어떤 종목이 맞을까요? (하체 발달형)', nickname: '12주남음', body: '160cm, 하체 비율이 큰 편이고 둔근이 발달한 체형인데 코치님은 웰니스를 추천하세요. 두 종목 다 나가본 분 계시면 심사 차이 알려주세요.', createdAt: '2026-10-20T21:30:00+09:00', views: 188, comments: [{ nickname: '웰니스3회', body: '하체 발달형이면 웰니스가 확실히 유리해요. 포징이 비키니랑 달라서 레슨은 따로 받으셔야 해요.', createdAt: '2026-10-21T09:00:00+09:00' }] },
    { id: 'p3', category: 'diet', title: '피킹 위크 탄수화물 로딩 어떻게 하시나요', nickname: '클래식피지크', body: '대회 D-7입니다. 수분 조절 없이 탄수만 올리는 방식으로 가려는데, 경험자분들 루틴 공유 부탁드려요.', createdAt: '2026-10-23T08:15:00+09:00', views: 97, comments: [] },
    { id: 'p4', category: 'mate', title: '11/7 WNGP 용인 같이 가실 분 (수원 출발)', nickname: '수원러', body: '수원에서 차로 갑니다. 2분 동승 가능하고 짐 관리 서로 도와요. 맨즈 피지크 오픈 출전입니다.', createdAt: '2026-10-24T19:40:00+09:00', views: 64, comments: [] },
    { id: 'p5', category: 'posing', title: '맨즈 피지크 보드숏 규정 길이 질문', nickname: '보드숏고민', body: '무릎 위 몇 cm까지 허용되는지 단체마다 다른가요? WNGP 기준으로 아시는 분 계실까요.', createdAt: '2026-10-22T14:05:00+09:00', views: 140, comments: [{ nickname: '운영진', body: 'WNGP는 무릎 위 길이면 통과되고 로고는 작은 것만 허용돼요. 자세한 건 unmo.kr 대회 페이지 규정 참고하세요.', createdAt: '2026-10-22T15:00:00+09:00' }] },
    { id: 'p6', category: 'market', title: '비키니 포징 힐 235 (1회 착용) 나눔', nickname: '시즌오프', body: '클리어 12cm, 한 번 신었어요. 택배비만 받습니다. 댓글 주세요.', createdAt: '2026-10-19T11:00:00+09:00', views: 221, comments: [] },
  ];
  const localPosts = () => {
    let list = LS.get('stageon_posts', null);
    if (!list) {
      list = SEED_POSTS;
      LS.set('stageon_posts', list);
    }
    return list;
  };
  const savePosts = (list) => LS.set('stageon_posts', list);

  S.community = {
    async list(params) {
      if (API_BASE) return (await S.api('/api/posts?' + new URLSearchParams(params))).rows;
      let list = localPosts();
      if (params.category && params.category !== 'all') list = list.filter((p) => p.category === params.category);
      if (params.q) list = list.filter((p) => (p.title + p.body + p.nickname).toLowerCase().includes(params.q.toLowerCase()));
      return list.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((p) => Object.assign({}, p, { commentCount: (p.comments || []).length }));
    },
    async get(id) {
      if (API_BASE) return (await S.api('/api/posts/' + encodeURIComponent(id))).post;
      const list = localPosts();
      const p = list.find((x) => x.id === id);
      if (p) {
        p.views = (p.views || 0) + 1;
        savePosts(list);
      }
      return p;
    },
    async create(data) {
      if (API_BASE) return (await S.api('/api/posts', { method: 'POST', body: JSON.stringify(data) })).post;
      const list = localPosts();
      const p = Object.assign({ id: 'l' + Date.now().toString(36), createdAt: new Date().toISOString(), views: 0, comments: [] }, data);
      delete p.password;
      p.pw = data.password;
      list.unshift(p);
      savePosts(list);
      return p;
    },
    async comment(id, data) {
      if (API_BASE) return (await S.api('/api/posts/' + encodeURIComponent(id) + '/comments', { method: 'POST', body: JSON.stringify(data) })).comment;
      const list = localPosts();
      const p = list.find((x) => x.id === id);
      const c = { nickname: data.nickname, body: data.body, createdAt: new Date().toISOString() };
      p.comments = p.comments || [];
      p.comments.push(c);
      savePosts(list);
      return c;
    },
    async remove(id, password) {
      if (API_BASE) return S.api('/api/posts/' + encodeURIComponent(id) + '/delete', { method: 'POST', body: JSON.stringify({ password }) });
      const list = localPosts();
      const i = list.findIndex((x) => x.id === id);
      if (i < 0) throw new Error('글을 찾을 수 없어요.');
      if (list[i].pw && list[i].pw !== password) throw new Error('비밀번호가 맞지 않아요.');
      list.splice(i, 1);
      savePosts(list);
      return { ok: true };
    },
  };

  pages.community = async () => {
    const root = document.getElementById('community');
    const catBar = document.getElementById('comm-cats');
    let category = S.qs('cat') || 'all';
    let q = '';
    const compId = S.qs('comp');
    let compName = '';
    if (compId) {
      try {
        await S.loadData();
        const c = S.comp(compId);
        if (c) compName = c.name;
      } catch (e) {}
    }
    catBar.innerHTML = `<button data-c="all" class="${category === 'all' ? 'active' : ''}">전체</button>` + CATS.map(([id, name]) => `<button data-c="${id}" class="${category === id ? 'active' : ''}">${name}</button>`).join('');
    const nick = LS.get('stageon_nick', '');

    const renderList = async () => {
      catBar.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.c === category));
      root.innerHTML = '<div class="empty">불러오는 중...</div>';
      let list;
      try {
        list = await S.community.list({ category, q: q || (compName ? compName : ''), limit: 100 });
      } catch (e) {
        root.innerHTML = `<div class="empty">${S.esc(e.message)}</div>`;
        return;
      }
      root.innerHTML = `
        ${compName ? `<p class="notice-bar" style="margin-bottom:12px">"${S.esc(compName)}" 관련 글을 보고 있어요. <a href="${ROOT}community.html" style="text-decoration:underline">전체 보기</a></p>` : ''}
        <div class="post-list">
          ${list.length ? list.map((p) => `
            <a class="post-row" href="${ROOT}community.html?id=${encodeURIComponent(p.id)}">
              <span class="pcat" style="background:${CAT[p.category] ? CAT[p.category].color : '#666'}">${CAT[p.category] ? CAT[p.category].name : p.category}</span>
              <div class="pmain"><h3>${S.esc(p.title)} ${p.commentCount ? `<em>[${p.commentCount}]</em>` : ''}</h3><div class="pmeta"><span>${S.esc(p.nickname)}</span><span>${S.ago(p.createdAt)}</span><span>조회 ${p.views || 0}</span></div></div>
            </a>`).join('') : '<div class="empty">아직 글이 없어요. 첫 글을 남겨보세요!</div>'}
        </div>`;
    };

    const renderDetail = async (id) => {
      root.innerHTML = '<div class="empty">불러오는 중...</div>';
      let p;
      try {
        p = await S.community.get(id);
      } catch (e) {
        root.innerHTML = `<div class="empty">${S.esc(e.message)}</div>`;
        return;
      }
      if (!p) {
        root.innerHTML = '<div class="empty">글을 찾을 수 없어요.</div>';
        return;
      }
      document.title = `${p.title} | 커뮤니티 | ${SITE.name}`;
      const c = CAT[p.category] || { name: p.category, color: '#666' };
      root.innerHTML = `
        <article class="post-detail">
          <div class="pd-head">
            <span class="pcat" style="background:${c.color}">${c.name}</span>
            <h1>${S.esc(p.title)}</h1>
            <div class="pmeta"><span>${S.esc(p.nickname)}</span><span>${new Date(p.createdAt).toLocaleString('ko-KR')}</span><span>조회 ${p.views || 0}</span><button class="link-btn" data-del>삭제</button></div>
          </div>
          <div class="pd-body">${S.esc(p.body).replace(/\n/g, '<br>')}</div>
          <div class="comments">
            <h2>댓글 <span>${(p.comments || []).length}</span></h2>
            <div class="comment-list">${(p.comments || []).map((cm) => `<div class="comment"><b>${S.esc(cm.nickname)}</b><p>${S.esc(cm.body).replace(/\n/g, '<br>')}</p><small>${S.ago(cm.createdAt)}</small></div>`).join('') || '<div class="empty" style="padding:20px 0">첫 댓글을 남겨보세요.</div>'}</div>
            <form class="comment-form" id="comment-form">
              <div class="field-row"><div class="field"><input name="nickname" placeholder="닉네임" value="${S.esc(nick)}" required maxlength="20"></div><div class="field"><input name="password" type="password" placeholder="비밀번호 (삭제용)" maxlength="20"></div></div>
              <div class="field"><textarea name="body" rows="3" placeholder="댓글을 입력하세요" required maxlength="1000"></textarea></div>
              <button class="btn btn-dark" type="submit">댓글 등록</button>
            </form>
          </div>
          <div style="margin-top:24px;display:flex;gap:8px"><a class="btn btn-outline" href="${ROOT}community.html?cat=${p.category}">목록으로</a><button class="btn btn-primary" data-write>글쓰기</button></div>
        </article>`;
      root.querySelector('#comment-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        if (!fd.get('nickname').trim() || !fd.get('body').trim()) return S.toast('닉네임과 내용을 입력해 주세요');
        LS.set('stageon_nick', fd.get('nickname').trim());
        try {
          await S.community.comment(p.id, { nickname: fd.get('nickname').trim(), password: fd.get('password') || '', body: fd.get('body').trim() });
          S.toast('댓글을 등록했어요');
          renderDetail(p.id);
        } catch (ex) {
          S.toast(ex.message);
        }
      });
      root.querySelector('[data-del]').addEventListener('click', async () => {
        const pw = prompt('글 작성 시 입력한 비밀번호를 입력하세요');
        if (pw === null) return;
        try {
          await S.community.remove(p.id, pw);
          S.toast('글을 삭제했어요');
          history.replaceState(null, '', ROOT + 'community.html');
          renderList();
        } catch (ex) {
          S.toast(ex.message);
        }
      });
      root.querySelector('[data-write]').addEventListener('click', openWrite);
    };

    const openWrite = () => {
      const box = S.modal(`
        <form id="write-form" class="order-form" novalidate>
          <h2>글쓰기</h2>
          <div class="field-row">
            <div class="field"><label>닉네임<em>*</em></label><input name="nickname" value="${S.esc(nick)}" required maxlength="20" placeholder="닉네임"></div>
            <div class="field"><label>비밀번호<em>*</em></label><input name="password" type="password" required maxlength="20" placeholder="글 삭제 시 사용"></div>
          </div>
          <div class="field"><label>게시판<em>*</em></label><select name="category">${CATS.map(([id, name]) => `<option value="${id}" ${id === (category === 'all' ? 'free' : category) ? 'selected' : ''}>${name}</option>`).join('')}</select></div>
          <div class="field"><label>제목<em>*</em></label><input name="title" required maxlength="80" placeholder="제목" value="${compName ? S.esc('[' + compName + '] ') : ''}"></div>
          <div class="field"><label>내용<em>*</em></label><textarea name="body" rows="8" required maxlength="5000" placeholder="대회 준비 중 궁금한 점, 후기, 팁을 자유롭게 남겨주세요. 개인정보·광고성 글은 삭제될 수 있어요."></textarea></div>
          <p class="form-error" id="write-error"></p>
          <button class="btn btn-primary btn-lg btn-block" type="submit">등록하기</button>
        </form>`, { cls: 'wide' });
      const form = box.querySelector('#write-form');
      const err = box.querySelector('#write-error');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const showErr = (m) => { err.textContent = m; err.classList.add('show'); };
        const d = { nickname: fd.get('nickname').trim(), password: fd.get('password'), category: fd.get('category'), title: fd.get('title').trim(), body: fd.get('body').trim() };
        if (!d.nickname || !d.password || !d.title || !d.body) return showErr('닉네임, 비밀번호, 제목, 내용을 모두 입력해 주세요.');
        LS.set('stageon_nick', d.nickname);
        try {
          const p = await S.community.create(d);
          S.closeModal();
          S.toast('글을 등록했어요');
          history.replaceState(null, '', ROOT + 'community.html?id=' + encodeURIComponent(p.id));
          renderDetail(p.id);
        } catch (ex) {
          showErr(ex.message);
        }
      });
    };

    catBar.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-c]');
      if (!b) return;
      category = b.dataset.c;
      history.replaceState(null, '', ROOT + 'community.html' + (category === 'all' ? '' : '?cat=' + category));
      renderList();
    });
    document.getElementById('comm-q').addEventListener('input', (e) => {
      q = e.target.value.trim();
      renderList();
    });
    document.getElementById('comm-write').addEventListener('click', openWrite);

    if (S.qs('id')) renderDetail(S.qs('id'));
    else renderList();
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
          ? '파일을 직접 열면 데이터(data/*.json)를 불러올 수 없어요.<br>로컬 서버로 실행하세요: <code>python -m http.server 8080</code> 후 http://localhost:8080 접속'
          : '데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
        main.prepend(box);
      }
    }
  });
})();

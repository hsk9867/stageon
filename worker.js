/**
 * 스테이지온 API (Cloudflare Worker + D1)
 *
 * 접수   POST /api/apply                     → { ok, code }
 * 주문   POST /api/order                     → { ok, code }
 * 이미지   POST /api/upload {data: dataURL}      → { ok, url }  (R2 바인딩 IMAGES, IMAGE_BASE)
 *        GET  /img/{key}                        R2 이미지 서빙 (IMAGE_BASE 미설정 시)
 * 커뮤니티
 *        GET  /api/posts?category=&q=&limit=  → { ok, rows }
 *        GET  /api/posts/:id                  → { ok, post }  (댓글 포함, 조회수 +1)
 *        POST /api/posts                      → { ok, post }
 *        POST /api/posts/:id/comments         → { ok, comment }
 *        POST /api/posts/:id/like {on}        → { ok, likes }
 *        POST /api/posts/:id/delete {password}→ { ok }
 * 관리자 GET  /api/applications?token=…  GET /api/orders?token=…  (format=csv 지원)
 *        POST /api/posts/:id/delete {token}   (관리자 삭제)
 *
 * 바인딩: DB(D1, schema.sql), ADMIN_TOKEN(secret), ALLOWED_ORIGIN(var)
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json; charset=utf-8',
    };
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
    const readJson = async () => {
      try {
        return await request.json();
      } catch (e) {
        return null;
      }
    };
    const isAdmin = (token) => env.ADMIN_TOKEN && token === env.ADMIN_TOKEN;
    const tokenOf = () => url.searchParams.get('token') || (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const path = url.pathname.replace(/\/$/, '');

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (path === '/api/health') return json({ ok: true, time: new Date().toISOString() });

    /* ---------- 접수 ---------- */
    if (path === '/api/apply' && request.method === 'POST') {
      const b = await readJson();
      if (!b) return json({ ok: false, error: '잘못된 요청 형식입니다.' }, 400);
      for (const k of ['competitionId', 'competitionName', 'name', 'phone', 'birth', 'gender']) {
        if (!b[k] || String(b[k]).trim() === '') return json({ ok: false, error: `${k} 항목이 필요합니다.` }, 400);
      }
      const phone = String(b.phone).replace(/[^0-9]/g, '');
      if (!/^01[016789][0-9]{7,8}$/.test(phone)) return json({ ok: false, error: '휴대폰 번호 형식이 올바르지 않습니다.' }, 400);
      const cats = Array.isArray(b.categories) ? b.categories : [];
      if (b.type !== 'pre' && cats.length === 0) return json({ ok: false, error: '출전 종목을 선택해 주세요.' }, 400);
      if (b.type !== 'pre') {
        const dup = await env.DB.prepare('SELECT code FROM applications WHERE competition_id = ? AND phone = ? AND type = ? LIMIT 1').bind(b.competitionId, phone, 'apply').first();
        if (dup) return json({ ok: false, error: `이미 접수된 번호예요. (접수번호 ${dup.code})` }, 409);
      }
      const code = mkCode('SO');
      await env.DB.prepare(
        `INSERT INTO applications (code, type, competition_id, competition_name, competition_date, org, name, birth, gender, phone, email, team, career,
           categories, division, class_info, height, weight, memo, agree, status, ip, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
        .bind(code, b.type === 'pre' ? 'pre' : 'apply', b.competitionId, b.competitionName, b.competitionDate || '', b.org || '', String(b.name).trim(), b.birth, b.gender, phone,
          b.email || '', b.team || '', b.career || '', JSON.stringify(cats), b.division || '', b.classInfo || '', b.height ? Number(b.height) : null, b.weight ? Number(b.weight) : null,
          b.memo || '', JSON.stringify(Array.isArray(b.agree) ? b.agree : []), b.type === 'pre' ? 'pre' : 'pending', ip)
        .run();
      return json({ ok: true, code });
    }

    /* ---------- 주문 ---------- */
    if (path === '/api/order' && request.method === 'POST') {
      const b = await readJson();
      if (!b || !Array.isArray(b.items) || !b.items.length) return json({ ok: false, error: '주문 상품이 없습니다.' }, 400);
      const buyer = b.buyer || {};
      if (!buyer.name || !buyer.phone) return json({ ok: false, error: '주문자 이름과 휴대폰이 필요합니다.' }, 400);
      const phone = String(buyer.phone).replace(/[^0-9]/g, '');
      if (!/^01[016789][0-9]{7,8}$/.test(phone)) return json({ ok: false, error: '휴대폰 번호 형식이 올바르지 않습니다.' }, 400);
      const total = b.items.reduce((a, x) => a + Number(x.price || 0) * Number(x.qty || 1), 0);
      const code = mkCode('ORD');
      await env.DB.prepare(
        `INSERT INTO orders (code, items, total, name, phone, email, address, competition, schedule, memo, status, ip, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'))`
      )
        .bind(code, JSON.stringify(b.items), total, String(buyer.name).trim(), phone, buyer.email || '', buyer.address || '', b.competition || '', b.schedule || '', b.memo || '', ip)
        .run();
      return json({ ok: true, code, total });
    }

    /* ---------- 이미지 업로드 (R2) ---------- */
    if (path === '/api/upload' && request.method === 'POST') {
      if (!env.IMAGES) return json({ ok: false, error: '이미지 저장소(R2)가 설정되지 않았습니다.' }, 500);
      const b = await readJson();
      const m = b && typeof b.data === 'string' && b.data.match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
      if (!m) return json({ ok: false, error: '이미지 형식이 올바르지 않습니다.' }, 400);
      const bytes = Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0));
      if (bytes.length > 3 * 1024 * 1024) return json({ ok: false, error: '이미지는 3MB 이하로 올려주세요.' }, 413);
      const ext = m[2] === 'jpeg' ? 'jpg' : m[2];
      const key = `posts/${new Date().toISOString().slice(0, 10)}/${mkId()}.${ext}`;
      await env.IMAGES.put(key, bytes, { httpMetadata: { contentType: m[1], cacheControl: 'public, max-age=31536000' } });
      const base = (env.IMAGE_BASE || '').replace(/\/$/, '');
      return json({ ok: true, key, url: base ? `${base}/${key}` : `${url.origin}/img/${key}` });
    }
    if (path.startsWith('/img/') && request.method === 'GET' && env.IMAGES) {
      const obj = await env.IMAGES.get(path.slice(5));
      if (!obj) return new Response('Not found', { status: 404 });
      return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg', 'Cache-Control': 'public, max-age=31536000', 'Access-Control-Allow-Origin': origin } });
    }

    /* ---------- 커뮤니티 ---------- */
    if (path === '/api/posts' && request.method === 'GET') {
      const category = url.searchParams.get('category') || 'all';
      const q = (url.searchParams.get('q') || '').trim();
      const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);
      let sql = `SELECT p.id, p.category, p.title, p.nickname, p.views, p.likes, p.created_at, p.image, p.tag,
                   (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
                 FROM posts p WHERE p.deleted = 0`;
      const binds = [];
      if (category !== 'all') { sql += ' AND p.category = ?'; binds.push(category); }
      if (q) { sql += ' AND (p.title LIKE ? OR p.body LIKE ? OR p.nickname LIKE ?)'; binds.push(`%${q}%`, `%${q}%`, `%${q}%`); }
      sql += ' ORDER BY p.id DESC LIMIT ?';
      binds.push(limit);
      const { results } = await env.DB.prepare(sql).bind(...binds).all();
      return json({ ok: true, rows: results.map(rowToPost) });
    }
    if (path === '/api/posts' && request.method === 'POST') {
      const b = await readJson();
      if (!b) return json({ ok: false, error: '잘못된 요청 형식입니다.' }, 400);
      const nickname = String(b.nickname || '').trim().slice(0, 20);
      const title = String(b.title || '').trim().slice(0, 80);
      const body = String(b.body || '').trim().slice(0, 5000);
      const category = String(b.category || 'free').slice(0, 20);
      const password = String(b.password || '');
      const tag = String(b.tag || '').slice(0, 20);
      const image = typeof b.image === 'string' && /^https?:\/\//.test(b.image) ? b.image.slice(0, 500) : '';
      if (!nickname || !title || !body || !password) return json({ ok: false, error: '닉네임, 비밀번호, 제목, 내용을 입력해 주세요.' }, 400);
      // 도배 방지: 같은 IP 1분 내 3건 초과 금지
      const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM posts WHERE ip = ? AND created_at > datetime('now', '-1 minute')").bind(ip).first();
      if (recent && recent.n >= 3) return json({ ok: false, error: '잠시 후 다시 시도해 주세요.' }, 429);
      const id = mkId();
      await env.DB.prepare('INSERT INTO posts (id, category, title, body, nickname, pw_hash, ip, image, tag, views, deleted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, datetime(\'now\'))')
        .bind(id, category, title, body, nickname, await sha256(password), ip, image, tag)
        .run();
      const post = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
      return json({ ok: true, post: Object.assign(rowToPost(post), { body, comments: [] }) });
    }
    const m = path.match(/^\/api\/posts\/([A-Za-z0-9_-]+)(?:\/(comments|delete|like))?$/);
    if (m) {
      const id = m[1];
      const sub = m[2];
      const post = await env.DB.prepare('SELECT * FROM posts WHERE id = ? AND deleted = 0').bind(id).first();
      if (!post) return json({ ok: false, error: '글을 찾을 수 없어요.' }, 404);
      if (!sub && request.method === 'GET') {
        await env.DB.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').bind(id).run();
        const { results } = await env.DB.prepare('SELECT id, nickname, body, created_at FROM comments WHERE post_id = ? AND deleted = 0 ORDER BY id ASC').bind(id).all();
        return json({ ok: true, post: Object.assign(rowToPost(post), { body: post.body, views: post.views + 1, comments: results.map((c) => ({ id: c.id, nickname: c.nickname, body: c.body, createdAt: c.created_at })) }) });
      }
      if (sub === 'comments' && request.method === 'POST') {
        const b = await readJson();
        const nickname = String((b && b.nickname) || '').trim().slice(0, 20);
        const body = String((b && b.body) || '').trim().slice(0, 1000);
        if (!nickname || !body) return json({ ok: false, error: '닉네임과 내용을 입력해 주세요.' }, 400);
        const r = await env.DB.prepare('INSERT INTO comments (post_id, nickname, body, pw_hash, ip, deleted, created_at) VALUES (?, ?, ?, ?, ?, 0, datetime(\'now\'))')
          .bind(id, nickname, body, await sha256(String((b && b.password) || '')), ip)
          .run();
        return json({ ok: true, comment: { id: r.meta && r.meta.last_row_id, nickname, body, createdAt: new Date().toISOString() } });
      }
      if (sub === 'like' && request.method === 'POST') {
        const b = (await readJson()) || {};
        const delta = b.on === false ? -1 : 1;
        await env.DB.prepare('UPDATE posts SET likes = MAX(0, likes + ?) WHERE id = ?').bind(delta, id).run();
        const row = await env.DB.prepare('SELECT likes FROM posts WHERE id = ?').bind(id).first();
        return json({ ok: true, likes: row ? row.likes : 0 });
      }
      if (sub === 'delete' && request.method === 'POST') {
        const b = (await readJson()) || {};
        const admin = isAdmin(b.token || tokenOf());
        if (!admin) {
          const hash = await sha256(String(b.password || ''));
          if (hash !== post.pw_hash) return json({ ok: false, error: '비밀번호가 맞지 않아요.' }, 403);
        }
        await env.DB.prepare('UPDATE posts SET deleted = 1 WHERE id = ?').bind(id).run();
        return json({ ok: true });
      }
    }

    /* ---------- 관리자 조회 ---------- */
    if ((path === '/api/applications' || path === '/api/orders') && request.method === 'GET') {
      if (!isAdmin(tokenOf())) return json({ ok: false, error: '권한이 없습니다.' }, 401);
      const table = path === '/api/orders' ? 'orders' : 'applications';
      const limit = Math.min(Number(url.searchParams.get('limit') || 200), 1000);
      const comp = url.searchParams.get('competition');
      const stmt = table === 'applications' && comp
        ? env.DB.prepare('SELECT * FROM applications WHERE competition_id = ? ORDER BY id DESC LIMIT ?').bind(comp, limit)
        : env.DB.prepare(`SELECT * FROM ${table} ORDER BY id DESC LIMIT ?`).bind(limit);
      const { results } = await stmt.all();
      const rows = results.map((r) => {
        const o = { ...r };
        ['categories', 'agree', 'items'].forEach((k) => { if (k in o) o[k] = safeJson(o[k]); });
        return o;
      });
      if (url.searchParams.get('format') === 'csv') {
        const cols = table === 'orders'
          ? ['code', 'status', 'total', 'items', 'name', 'phone', 'email', 'address', 'competition', 'schedule', 'memo', 'created_at']
          : ['code', 'status', 'competition_name', 'competition_date', 'org', 'name', 'birth', 'gender', 'phone', 'email', 'team', 'career', 'categories', 'division', 'class_info', 'height', 'weight', 'memo', 'created_at'];
        const esc = (v) => '"' + String(v == null ? '' : Array.isArray(v) ? v.map((x) => (typeof x === 'object' ? `${x.name}${x.option ? '(' + x.option + ')' : ''}x${x.qty}` : x)).join(' / ') : v).replace(/"/g, '""') + '"';
        const csv = '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
        return new Response(csv, { headers: { ...cors, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${table}.csv"` } });
      }
      return json({ ok: true, count: rows.length, rows });
    }

    return json({ ok: false, error: 'Not found' }, 404);
  },
};

function mkCode(prefix) {
  return prefix + '-' + Date.now().toString(36).toUpperCase().slice(-6) + Math.random().toString(36).slice(2, 4).toUpperCase();
}
function mkId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function rowToPost(r) {
  return { id: r.id, category: r.category, title: r.title, nickname: r.nickname, views: r.views, createdAt: r.created_at, image: r.image || '', tag: r.tag || '', likes: r.likes || 0, commentCount: r.comment_count || 0 };
}
function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch (e) {
    return s;
  }
}
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('stageon:' + str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

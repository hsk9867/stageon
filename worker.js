/**
 * 스테이지온 접수 API (Cloudflare Worker + D1)
 *
 * 엔드포인트
 *  POST /api/apply                 접수 신청 저장 → { ok, code }
 *  GET  /api/applications?token=…  관리자 조회 (ADMIN_TOKEN 시크릿 필요)
 *  GET  /api/health                상태 확인
 *
 * 바인딩 (wrangler.toml)
 *  DB            D1 데이터베이스 (schema.sql 적용)
 *  ADMIN_TOKEN   wrangler secret put ADMIN_TOKEN  (별도 터미널에서 실행)
 *  ALLOWED_ORIGIN  예: https://stageon.kr  (비우면 * 허용)
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json; charset=utf-8',
    };
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (url.pathname === '/api/health') return json({ ok: true, time: new Date().toISOString() });

    if (url.pathname === '/api/apply' && request.method === 'POST') {
      let b;
      try {
        b = await request.json();
      } catch (e) {
        return json({ ok: false, error: '잘못된 요청 형식입니다.' }, 400);
      }
      const required = ['competitionId', 'competitionName', 'name', 'phone', 'birth', 'gender'];
      for (const k of required) {
        if (!b[k] || String(b[k]).trim() === '') return json({ ok: false, error: `${k} 항목이 필요합니다.` }, 400);
      }
      const phone = String(b.phone).replace(/[^0-9]/g, '');
      if (!/^01[016789][0-9]{7,8}$/.test(phone)) return json({ ok: false, error: '휴대폰 번호 형식이 올바르지 않습니다.' }, 400);
      const cats = Array.isArray(b.categories) ? b.categories : [];
      if (b.type !== 'pre' && cats.length === 0) return json({ ok: false, error: '출전 종목을 선택해 주세요.' }, 400);

      // 같은 대회·같은 번호 중복 접수 방지 (사전알림은 제외)
      if (b.type !== 'pre') {
        const dup = await env.DB.prepare('SELECT code FROM applications WHERE competition_id = ? AND phone = ? AND type = ? LIMIT 1')
          .bind(b.competitionId, phone, 'apply')
          .first();
        if (dup) return json({ ok: false, error: `이미 접수된 번호예요. (접수번호 ${dup.code})` }, 409);
      }

      const code = 'SO-' + Date.now().toString(36).toUpperCase().slice(-6) + Math.random().toString(36).slice(2, 4).toUpperCase();
      const ip = request.headers.get('CF-Connecting-IP') || '';
      await env.DB.prepare(
        `INSERT INTO applications
          (code, type, competition_id, competition_name, competition_date, org, name, birth, gender, phone, email, team, career,
           categories, division, class_info, height, weight, memo, agree, status, ip, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
        .bind(
          code,
          b.type === 'pre' ? 'pre' : 'apply',
          b.competitionId,
          b.competitionName,
          b.competitionDate || '',
          b.org || '',
          String(b.name).trim(),
          b.birth,
          b.gender,
          phone,
          b.email || '',
          b.team || '',
          b.career || '',
          JSON.stringify(cats),
          b.division || '',
          b.classInfo || '',
          b.height ? Number(b.height) : null,
          b.weight ? Number(b.weight) : null,
          b.memo || '',
          JSON.stringify(Array.isArray(b.agree) ? b.agree : []),
          b.type === 'pre' ? 'pre' : 'pending',
          ip
        )
        .run();
      return json({ ok: true, code });
    }

    if (url.pathname === '/api/applications' && request.method === 'GET') {
      const token = url.searchParams.get('token') || request.headers.get('Authorization')?.replace('Bearer ', '');
      if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) return json({ ok: false, error: '권한이 없습니다.' }, 401);
      const comp = url.searchParams.get('competition');
      const limit = Math.min(Number(url.searchParams.get('limit') || 200), 1000);
      const stmt = comp
        ? env.DB.prepare('SELECT * FROM applications WHERE competition_id = ? ORDER BY id DESC LIMIT ?').bind(comp, limit)
        : env.DB.prepare('SELECT * FROM applications ORDER BY id DESC LIMIT ?').bind(limit);
      const { results } = await stmt.all();
      const rows = results.map((r) => ({ ...r, categories: safeJson(r.categories), agree: safeJson(r.agree) }));
      // CSV 다운로드 (?format=csv)
      if (url.searchParams.get('format') === 'csv') {
        const cols = ['code', 'status', 'competition_name', 'competition_date', 'org', 'name', 'birth', 'gender', 'phone', 'email', 'team', 'career', 'categories', 'division', 'class_info', 'height', 'weight', 'memo', 'created_at'];
        const esc = (v) => '"' + String(v == null ? '' : Array.isArray(v) ? v.join(' / ') : v).replace(/"/g, '""') + '"';
        const csv = '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
        return new Response(csv, { headers: { ...cors, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="applications.csv"' } });
      }
      return json({ ok: true, count: rows.length, rows });
    }

    return json({ ok: false, error: 'Not found' }, 404);
  },
};

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch (e) {
    return s;
  }
}

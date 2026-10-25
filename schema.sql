-- 스테이지온 접수 테이블 (Cloudflare D1)
-- 적용: npx wrangler d1 execute stageon-db --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'apply',          -- apply | pre(사전알림)
  competition_id TEXT NOT NULL,
  competition_name TEXT NOT NULL,
  competition_date TEXT,
  org TEXT,
  name TEXT NOT NULL,
  birth TEXT,
  gender TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  team TEXT,
  career TEXT,
  categories TEXT,                             -- JSON 배열
  division TEXT,
  class_info TEXT,
  height REAL,
  weight REAL,
  memo TEXT,
  agree TEXT,                                  -- JSON 배열
  status TEXT NOT NULL DEFAULT 'pending',      -- pending(입금대기) | paid(확정) | cancelled | pre
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_app_comp ON applications (competition_id);
CREATE INDEX IF NOT EXISTS idx_app_phone ON applications (phone);

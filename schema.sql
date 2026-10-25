-- 스테이지온 D1 스키마
-- 적용: npx wrangler d1 execute stageon-db --remote --file=schema.sql

-- 대회 접수
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

-- 준비 쇼핑 주문
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  items TEXT NOT NULL,                         -- JSON [{id,name,option,qty,price,type}]
  total INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  competition TEXT,
  schedule TEXT,
  memo TEXT,
  status TEXT NOT NULL DEFAULT 'pending',      -- pending(입금대기) | paid | shipped | done | cancelled
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders (phone);

-- 커뮤니티 게시글
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'free',       -- free | review | qna | diet | posing | market | mate
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  nickname TEXT NOT NULL,
  pw_hash TEXT NOT NULL,
  ip TEXT,
  views INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_posts_cat ON posts (category, deleted);

-- 댓글
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  body TEXT NOT NULL,
  pw_hash TEXT,
  ip TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments (post_id, deleted);

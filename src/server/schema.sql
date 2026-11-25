-- SoundzRoot relational core (development: SQLite; production: PostgreSQL).
-- UUID primary keys, ISO-8601 UTC timestamps, money in minor units (pesewas).

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('artist','beatmaker','studio_owner','engineer','admin')),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,              -- sha256 of the session token
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS producer_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  display_name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  bio TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  hue INTEGER NOT NULL DEFAULT 160,
  payout_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT REFERENCES users(id),
  kind TEXT NOT NULL,               -- master | preview | stems | artwork | version | reference
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  checksum TEXT NOT NULL,
  scan_status TEXT NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending','clean','quarantined')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS beats (
  id TEXT PRIMARY KEY,
  producer_id TEXT NOT NULL REFERENCES producer_profiles(id),
  title TEXT NOT NULL,
  genre TEXT NOT NULL,
  mood TEXT NOT NULL DEFAULT '',
  bpm INTEGER NOT NULL,
  musical_key TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','unpublished','archived','exclusive_sold','taken_down')),
  art_seed INTEGER NOT NULL,
  hue INTEGER NOT NULL,
  master_asset_id TEXT REFERENCES assets(id),
  preview_asset_id TEXT REFERENCES assets(id),
  stems_asset_id TEXT REFERENCES assets(id),
  waveform_json TEXT,
  duration_ms INTEGER,
  processing_status TEXT NOT NULL DEFAULT 'none' CHECK (processing_status IN ('none','queued','processing','ready','failed')),
  ownership_declared_at TEXT,
  exclusive_hold_order_id TEXT,
  exclusive_hold_until TEXT,
  plays INTEGER NOT NULL DEFAULT 0,
  sales_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  published_at TEXT
);
CREATE INDEX IF NOT EXISTS beats_status_idx ON beats(status, published_at);

-- Immutable license versions. Editing a tier creates a new row and retires the old one.
CREATE TABLE IF NOT EXISTS license_versions (
  id TEXT PRIMARY KEY,
  beat_id TEXT NOT NULL REFERENCES beats(id),
  tier TEXT NOT NULL CHECK (tier IN ('free','basic','premium','unlimited','exclusive')),
  name TEXT NOT NULL,
  price_minor INTEGER NOT NULL CHECK (price_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'GHS',
  terms_json TEXT NOT NULL,
  version INTEGER NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS license_beat_idx ON license_versions(beat_id, is_current);

CREATE TABLE IF NOT EXISTS studios (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  tagline TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'Africa/Accra',
  open_hour INTEGER NOT NULL DEFAULT 9,
  close_hour INTEGER NOT NULL DEFAULT 22,
  deposit_pct INTEGER NOT NULL DEFAULT 30,
  cancellation_policy TEXT NOT NULL DEFAULT '',
  hue INTEGER NOT NULL DEFAULT 170,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  studio_id TEXT NOT NULL REFERENCES studios(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('owner','manager','engineer')),
  can_view_finance INTEGER NOT NULL DEFAULT 0,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (studio_id, user_id)
);

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  studio_id TEXT NOT NULL REFERENCES studios(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  can_view_finance INTEGER NOT NULL DEFAULT 0,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  studio_id TEXT NOT NULL REFERENCES studios(id),
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 4,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  studio_id TEXT NOT NULL REFERENCES studios(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  duration_min INTEGER NOT NULL,
  rate_minor INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS blackouts (
  id TEXT PRIMARY KEY,
  studio_id TEXT NOT NULL REFERENCES studios(id),
  room_id TEXT REFERENCES rooms(id),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  studio_id TEXT NOT NULL REFERENCES studios(id),
  user_id TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  private_notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  studio_id TEXT NOT NULL REFERENCES studios(id),
  room_id TEXT NOT NULL REFERENCES rooms(id),
  service_id TEXT NOT NULL REFERENCES services(id),
  engineer_user_id TEXT REFERENCES users(id),
  artist_user_id TEXT REFERENCES users(id),
  client_id TEXT REFERENCES clients(id),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('held','confirmed','cancelled','expired','completed')),
  hold_expires_at TEXT,
  quoted_minor INTEGER NOT NULL,
  deposit_minor INTEGER NOT NULL,
  paid_minor INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('platform','manual')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bookings_room_time_idx ON bookings(room_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS bookings_studio_idx ON bookings(studio_id, starts_at);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  studio_id TEXT NOT NULL REFERENCES studios(id),
  booking_id TEXT REFERENCES bookings(id),
  client_id TEXT REFERENCES clients(id),
  title TEXT NOT NULL,
  deliverables TEXT NOT NULL DEFAULT '',
  revision_allowance INTEGER NOT NULL DEFAULT 2,
  revisions_used INTEGER NOT NULL DEFAULT 0,
  due_date TEXT,
  price_minor INTEGER NOT NULL DEFAULT 0,
  paid_minor INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft','active','in_review','approved','delivered','archived')),
  final_version_id TEXT,
  package_json TEXT NOT NULL DEFAULT '[]',
  hue INTEGER NOT NULL DEFAULT 170,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id TEXT NOT NULL REFERENCES projects(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('artist','engineer')),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS audio_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  asset_id TEXT NOT NULL REFERENCES assets(id),
  version_number INTEGER NOT NULL,
  label TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  waveform_json TEXT,
  duration_ms INTEGER,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE (project_id, version_number)
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES audio_versions(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  timestamp_ms INTEGER,
  kind TEXT NOT NULL DEFAULT 'comment' CHECK (kind IN ('comment','revision_request')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL UNIQUE REFERENCES audio_versions(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_messages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_events (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  user_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  buyer_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('beat','booking','project')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','paid','failed','expired','partially_refunded','refunded','disputed')),
  total_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  booking_id TEXT REFERENCES bookings(id),
  project_id TEXT REFERENCES projects(id),
  expires_at TEXT,
  refunded_minor INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  paid_at TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  beat_id TEXT REFERENCES beats(id),
  license_version_id TEXT REFERENCES license_versions(id),
  seller_user_id TEXT NOT NULL REFERENCES users(id),
  description TEXT NOT NULL,
  price_minor INTEGER NOT NULL,
  license_snapshot_json TEXT,
  terms_accepted_at TEXT
);

CREATE TABLE IF NOT EXISTS entitlements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  order_item_id TEXT NOT NULL UNIQUE REFERENCES order_items(id),
  beat_id TEXT NOT NULL REFERENCES beats(id),
  asset_ids_json TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  provider TEXT NOT NULL,
  provider_ref TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  method TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','processing','paid','failed','expired','partially_refunded','refunded','disputed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,              -- provider event id (dedupe key)
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  received_at TEXT NOT NULL,
  processed_at TEXT
);

-- Double-entry style ledger. The UNIQUE key makes webhook replays harmless.
CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  payment_id TEXT REFERENCES payments(id),
  event_key TEXT NOT NULL,
  account TEXT NOT NULL,            -- seller:<userId> | studio:<studioId> | platform | provider_fee | buyer:<userId>
  entry_type TEXT NOT NULL,         -- gross | platform_fee | seller_payable | refund | payout
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (event_key, account, entry_type)
);

CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('requested','paid','failed')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  studio_id TEXT NOT NULL REFERENCES studios(id),
  description TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  spent_on TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notif_user_idx ON notifications(user_id, created_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  payload TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT REFERENCES users(id),
  beat_id TEXT NOT NULL REFERENCES beats(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
  resolution TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS disputes (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  opened_by TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved_refund','resolved_no_action')),
  resolution TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  run_after TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_ready_idx ON jobs(status, run_after);

-- Email verification links: only a hash of the token is stored. Single use, 48 h expiry.
CREATE TABLE IF NOT EXISTS email_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS email_verifications_user ON email_verifications(user_id, created_at);

-- Per-category email opt-outs. No row = email on. In-app notifications are never affected.
CREATE TABLE IF NOT EXISTS email_prefs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, category)
);

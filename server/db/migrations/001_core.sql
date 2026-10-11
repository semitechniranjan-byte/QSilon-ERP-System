-- 001_core: settings, users, auth, files, audit
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS school_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name text NOT NULL DEFAULT 'School Management System',
  name_hi text,
  tagline text,
  tagline_hi text,
  logo_file_id uuid,
  address text,
  city text,
  state text,
  pincode text,
  phone text,
  email text,
  website text,
  map_url text,
  established_year int,
  principal_name text,
  about text,
  about_hi text,
  mission text,
  mission_hi text,
  hero_image_file_id uuid,
  receipt_prefix text NOT NULL DEFAULT 'RCP',
  invoice_prefix text NOT NULL DEFAULT 'INV',
  student_id_prefix text NOT NULL DEFAULT 'STU',
  teacher_id_prefix text NOT NULL DEFAULT 'TCH',
  admission_prefix text NOT NULL DEFAULT 'ADM',
  default_language text NOT NULL DEFAULT 'en' CHECK (default_language IN ('en','hi')),
  allow_admission_no_login boolean NOT NULL DEFAULT true,
  allow_roll_login boolean NOT NULL DEFAULT false,
  show_fees_to_students boolean NOT NULL DEFAULT true,
  attendance_edit_window_days int NOT NULL DEFAULT 2 CHECK (attendance_edit_window_days >= 0),
  public_stats_mode text NOT NULL DEFAULT 'auto' CHECK (public_stats_mode IN ('auto','manual','hidden')),
  public_students_count int,
  public_teachers_count int,
  public_classes_count int,
  public_years_experience int,
  enquiry_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO school_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS files (
  id uuid PRIMARY KEY,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes int NOT NULL,
  visibility text NOT NULL CHECK (visibility IN ('public','private')),
  purpose text NOT NULL,
  data bytea NOT NULL,
  uploaded_by bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id bigserial PRIMARY KEY,
  username citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','accountant','teacher','student','parent')),
  display_name text NOT NULL,
  email citext,
  is_active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT true,
  preferred_language text NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en','hi')),
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  password_changed_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);

-- Extra fine-grained permissions granted to individual users on top of their role.
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission text NOT NULL,
  granted_by bigint REFERENCES users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission)
);

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id bigserial PRIMARY KEY,
  identifier text NOT NULL,
  user_id bigint REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','rejected')),
  resolved_by bigint REFERENCES users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Session store used by connect-pg-simple.
CREATE TABLE IF NOT EXISTS "session" (
  sid varchar NOT NULL PRIMARY KEY,
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS session_expire_idx ON "session"(expire);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_user_id bigint REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb,
  ip text
);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_at_idx ON audit_logs(at DESC);

-- Gapless, transaction-safe counters for IDs and document numbers.
CREATE TABLE IF NOT EXISTS counters (
  key text PRIMARY KEY,
  value bigint NOT NULL DEFAULT 0
);

-- Outbound communication log. Messages are only marked 'sent' when a configured provider confirms it.
CREATE TABLE IF NOT EXISTS message_outbox (
  id bigserial PRIMARY KEY,
  channel text NOT NULL CHECK (channel IN ('email','sms','whatsapp')),
  recipient text NOT NULL,
  subject text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','not_configured')),
  provider_response text,
  related_type text,
  related_id text,
  created_by bigint REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

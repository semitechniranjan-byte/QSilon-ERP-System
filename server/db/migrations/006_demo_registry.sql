-- 006: registry of configuration rows created by the demo seed, so demo data can be removed safely.
CREATE TABLE IF NOT EXISTS demo_records (
  table_name text NOT NULL,
  record_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, record_id)
);

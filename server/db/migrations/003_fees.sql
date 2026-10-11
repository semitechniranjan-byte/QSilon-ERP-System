-- 003_fees: fee configuration, invoices, payments, receipts, adjustments. All money in integer paise.

CREATE TABLE IF NOT EXISTS fee_categories (
  id bigserial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  name_hi text,
  kind text NOT NULL CHECK (kind IN ('admission','tuition','preschool_course','annual','exam','hostel','transport','uniform','books','activity','other')),
  default_frequency text NOT NULL DEFAULT 'monthly' CHECK (default_frequency IN ('one_time','monthly','quarterly','half_yearly','annual')),
  is_refundable boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fee_plans (
  id bigserial PRIMARY KEY,
  academic_year_id bigint NOT NULL REFERENCES academic_years(id),
  name text NOT NULL,
  plan_type text NOT NULL CHECK (plan_type IN ('preschool','school','hostel')),
  class_level_id bigint REFERENCES class_levels(id),
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (academic_year_id, name)
);

CREATE TABLE IF NOT EXISTS fee_plan_items (
  id bigserial PRIMARY KEY,
  fee_plan_id bigint NOT NULL REFERENCES fee_plans(id) ON DELETE CASCADE,
  fee_category_id bigint NOT NULL REFERENCES fee_categories(id),
  amount_paise bigint NOT NULL CHECK (amount_paise >= 0),
  frequency text NOT NULL CHECK (frequency IN ('one_time','monthly','quarterly','half_yearly','annual')),
  due_day int NOT NULL DEFAULT 10 CHECK (due_day BETWEEN 1 AND 28),
  UNIQUE (fee_plan_id, fee_category_id)
);

-- Plans assigned to an enrollment: at most one per plan type (base preschool/school plan + optional hostel plan).
CREATE TABLE IF NOT EXISTS student_fee_plans (
  id bigserial PRIMARY KEY,
  enrollment_id bigint NOT NULL REFERENCES enrollments(id),
  fee_plan_id bigint NOT NULL REFERENCES fee_plans(id),
  plan_type text NOT NULL,
  assigned_by bigint REFERENCES users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, plan_type)
);

CREATE TABLE IF NOT EXISTS concessions (
  id bigserial PRIMARY KEY,
  enrollment_id bigint NOT NULL REFERENCES enrollments(id),
  fee_category_id bigint REFERENCES fee_categories(id), -- NULL = applies to all categories
  label text NOT NULL CHECK (label IN ('concession','scholarship','discount')),
  kind text NOT NULL CHECK (kind IN ('percent','fixed')),
  percent_bp int CHECK (percent_bp IS NULL OR percent_bp BETWEEN 1 AND 10000),
  amount_paise bigint CHECK (amount_paise IS NULL OR amount_paise > 0),
  reason text NOT NULL,
  approved_by bigint REFERENCES users(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'percent' AND percent_bp IS NOT NULL) OR (kind = 'fixed' AND amount_paise IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS fee_invoices (
  id bigserial PRIMARY KEY,
  invoice_no text NOT NULL UNIQUE,
  student_id bigint NOT NULL REFERENCES students(id),
  enrollment_id bigint NOT NULL REFERENCES enrollments(id),
  academic_year_id bigint NOT NULL REFERENCES academic_years(id),
  period_key text NOT NULL,
  period_label text NOT NULL,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','cancelled')),
  created_by bigint REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_by bigint REFERENCES users(id),
  cancelled_at timestamptz,
  cancel_reason text
);
CREATE UNIQUE INDEX IF NOT EXISTS fee_invoices_period_uniq ON fee_invoices(enrollment_id, period_key) WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS fee_invoices_student_idx ON fee_invoices(student_id);

CREATE TABLE IF NOT EXISTS fee_invoice_lines (
  id bigserial PRIMARY KEY,
  invoice_id bigint NOT NULL REFERENCES fee_invoices(id),
  fee_category_id bigint NOT NULL REFERENCES fee_categories(id),
  description text NOT NULL,
  amount_paise bigint NOT NULL CHECK (amount_paise >= 0),
  discount_paise bigint NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
  charge_key text NOT NULL,
  is_void boolean NOT NULL DEFAULT false,
  CHECK (discount_paise <= amount_paise)
);
-- The charge key makes generation idempotent: the same charge can never be billed twice.
CREATE UNIQUE INDEX IF NOT EXISTS fee_invoice_lines_charge_uniq ON fee_invoice_lines(charge_key) WHERE NOT is_void;
CREATE INDEX IF NOT EXISTS fee_invoice_lines_invoice_idx ON fee_invoice_lines(invoice_id);

-- Authorized waivers/credits applied after invoicing.
CREATE TABLE IF NOT EXISTS fee_adjustments (
  id bigserial PRIMARY KEY,
  invoice_line_id bigint NOT NULL REFERENCES fee_invoice_lines(id),
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  reason text NOT NULL,
  approved_by bigint NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  is_reversed boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS payments (
  id bigserial PRIMARY KEY,
  student_id bigint NOT NULL REFERENCES students(id),
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  mode text NOT NULL CHECK (mode IN ('cash','bank_transfer','upi','card','cheque','other')),
  reference text,
  paid_on date NOT NULL,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','reversed')),
  received_by bigint NOT NULL REFERENCES users(id),
  notes text,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  reversed_by bigint REFERENCES users(id),
  reversal_reason text
);
CREATE INDEX IF NOT EXISTS payments_student_idx ON payments(student_id);
CREATE INDEX IF NOT EXISTS payments_paid_on_idx ON payments(paid_on);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id bigserial PRIMARY KEY,
  payment_id bigint NOT NULL REFERENCES payments(id),
  invoice_line_id bigint NOT NULL REFERENCES fee_invoice_lines(id),
  amount_paise bigint NOT NULL CHECK (amount_paise > 0)
);
CREATE INDEX IF NOT EXISTS payment_allocations_line_idx ON payment_allocations(invoice_line_id);
CREATE INDEX IF NOT EXISTS payment_allocations_payment_idx ON payment_allocations(payment_id);

CREATE TABLE IF NOT EXISTS receipts (
  id bigserial PRIMARY KEY,
  receipt_no text NOT NULL UNIQUE,
  payment_id bigint NOT NULL UNIQUE REFERENCES payments(id),
  issued_at timestamptz NOT NULL DEFAULT now(),
  issued_by bigint REFERENCES users(id),
  snapshot jsonb NOT NULL,
  print_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','cancelled'))
);

CREATE TABLE IF NOT EXISTS refunds (
  id bigserial PRIMARY KEY,
  refund_no text NOT NULL UNIQUE,
  payment_id bigint NOT NULL REFERENCES payments(id),
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  mode text NOT NULL,
  reference text,
  reason text NOT NULL,
  approved_by bigint NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS refund_allocations (
  id bigserial PRIMARY KEY,
  refund_id bigint NOT NULL REFERENCES refunds(id),
  invoice_line_id bigint NOT NULL REFERENCES fee_invoice_lines(id),
  amount_paise bigint NOT NULL CHECK (amount_paise > 0)
);

-- Balance of each billable line, derived only from recorded financial transactions.
CREATE OR REPLACE VIEW fee_line_balances AS
SELECT l.id AS line_id,
       l.invoice_id,
       i.invoice_no,
       i.student_id,
       i.enrollment_id,
       i.academic_year_id,
       i.period_label,
       i.due_date,
       l.fee_category_id,
       l.description,
       l.amount_paise,
       l.discount_paise,
       (l.amount_paise - l.discount_paise) AS net_paise,
       COALESCE(adj.total, 0) AS adjusted_paise,
       COALESCE(pa.total, 0) - COALESCE(ra.total, 0) AS paid_paise,
       (l.amount_paise - l.discount_paise) - COALESCE(adj.total, 0) - (COALESCE(pa.total, 0) - COALESCE(ra.total, 0)) AS outstanding_paise
FROM fee_invoice_lines l
JOIN fee_invoices i ON i.id = l.invoice_id
LEFT JOIN LATERAL (SELECT SUM(a.amount_paise) total FROM fee_adjustments a WHERE a.invoice_line_id = l.id AND NOT a.is_reversed) adj ON true
LEFT JOIN LATERAL (SELECT SUM(x.amount_paise) total FROM payment_allocations x JOIN payments p ON p.id = x.payment_id
                   WHERE x.invoice_line_id = l.id AND p.status = 'completed') pa ON true
LEFT JOIN LATERAL (SELECT SUM(r.amount_paise) total FROM refund_allocations r JOIN refunds rf ON rf.id = r.refund_id JOIN payments p ON p.id = rf.payment_id
                   WHERE r.invoice_line_id = l.id AND p.status = 'completed') ra ON true
WHERE NOT l.is_void AND i.status <> 'cancelled';

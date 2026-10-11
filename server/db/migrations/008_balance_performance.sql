-- 008: faster balance calculations (index-driven per line) and supporting indexes.
CREATE INDEX IF NOT EXISTS fee_adjustments_line_idx ON fee_adjustments(invoice_line_id) WHERE NOT is_reversed;
CREATE INDEX IF NOT EXISTS refund_allocations_line_idx ON refund_allocations(invoice_line_id);
CREATE INDEX IF NOT EXISTS refunds_payment_idx ON refunds(payment_id);
CREATE INDEX IF NOT EXISTS fee_invoices_year_idx ON fee_invoices(academic_year_id) WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS attendance_date_idx ON attendance_records(date);

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
LEFT JOIN LATERAL (SELECT SUM(x.amount_paise) total FROM payment_allocations x
                   WHERE x.invoice_line_id = l.id AND (SELECT p.status FROM payments p WHERE p.id = x.payment_id) = 'completed') pa ON true
LEFT JOIN LATERAL (SELECT SUM(r.amount_paise) total FROM refund_allocations r
                   WHERE r.invoice_line_id = l.id
                     AND (SELECT p.status FROM payments p JOIN refunds rf ON rf.payment_id = p.id WHERE rf.id = r.refund_id) = 'completed') ra ON true
WHERE NOT l.is_void AND i.status <> 'cancelled';

ANALYZE;

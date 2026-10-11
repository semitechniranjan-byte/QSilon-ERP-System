import type { PoolClient } from 'pg';
import crypto from 'node:crypto';
import { one, pool, q, tx, type Db } from '../db/pool.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { nextCounter, pad } from '../lib/counters.js';
import { percentOf } from '../lib/money.js';
import { addMonths, monthLabel, todayIST } from '../lib/dates.js';
import { settings } from '../lib/context.js';

export type Frequency = 'one_time' | 'monthly' | 'quarterly' | 'half_yearly' | 'annual';

/** Validate and attach a fee plan to an enrollment (one plan per plan type). */
export async function assignPlan(c: Db, enrollmentId: number, planId: number, userId: number | null) {
  const e = await one(
    `SELECT e.id, e.academic_year_id, e.class_level_id, e.residency, cl.is_preschool FROM enrollments e
       JOIN class_levels cl ON cl.id = e.class_level_id WHERE e.id = $1`, [enrollmentId], c);
  if (!e) throw notFound('Enrollment not found.');
  const p = await one('SELECT id, plan_type, academic_year_id, class_level_id, is_active, name FROM fee_plans WHERE id = $1', [planId], c);
  if (!p || !p.is_active) throw badRequest('Fee plan not found or inactive.');
  if (p.academic_year_id !== e.academic_year_id) throw badRequest(`Fee plan "${p.name}" belongs to a different academic year.`);
  if (p.class_level_id && p.class_level_id !== e.class_level_id) throw badRequest(`Fee plan "${p.name}" is for a different class.`);
  if (p.plan_type === 'preschool' && !e.is_preschool) throw badRequest('A preschool fee plan can only be assigned to a preschool class.');
  if (p.plan_type === 'school' && e.is_preschool) throw badRequest('Use a preschool fee plan for preschool classes.');
  if (p.plan_type === 'hostel' && e.residency !== 'hostel') throw badRequest('A hostel fee plan can only be assigned to hostel residents.');
  await c.query(
    `INSERT INTO student_fee_plans (enrollment_id, fee_plan_id, plan_type, assigned_by) VALUES ($1,$2,$3,$4)
     ON CONFLICT (enrollment_id, plan_type) DO UPDATE SET fee_plan_id = EXCLUDED.fee_plan_id, assigned_by = EXCLUDED.assigned_by, assigned_at = now()`,
    [enrollmentId, planId, p.plan_type, userId]);
}

export interface ChargeLine {
  feeCategoryId: number;
  description: string;
  amountPaise: number;
  discountPaise: number;
  chargeKey: string;
  dueDay: number;
  source: string;
}

/**
 * Compute the charges billable to an enrollment for a given month (YYYY-MM).
 * Rules:
 *  - Base plan (preschool or school) applies to everyone with that plan assigned.
 *  - Hostel plan applies only while residency is 'hostel'. If a hostel plan contains a category that is also in the
 *    base plan (a package), the hostel plan's item wins and the base item is skipped — no duplicate charge.
 *  - Transport is charged from the student's route only when transport is opted in.
 *  - one_time items are charged once per student for life (e.g. admission, uniform); annual items once per enrollment year;
 *    monthly/quarterly/half-yearly items on the matching months of the academic year. Students joining mid-year are
 *    billed from their joining month.
 *  - Concessions/scholarships are applied per line and never exceed the line amount.
 */
export async function computeCharges(c: Db, enrollmentId: number, ym: string): Promise<{ lines: ChargeLine[]; skipped?: string }> {
  const e = await one(
    `SELECT e.*, y.start_date, y.end_date, y.name AS year_name FROM enrollments e JOIN academic_years y ON y.id = e.academic_year_id WHERE e.id = $1`,
    [enrollmentId], c);
  if (!e) throw notFound('Enrollment not found.');
  const yStart = e.start_date.slice(0, 7);
  const yEnd = e.end_date.slice(0, 7);
  if (ym < yStart || ym > yEnd) return { lines: [], skipped: 'Month is outside the academic year.' };
  const firstMonth = e.enrolled_on.slice(0, 7) > yStart ? e.enrolled_on.slice(0, 7) : yStart;
  if (ym < firstMonth) return { lines: [], skipped: 'Student had not joined in this month.' };
  if (e.status !== 'active' && (!e.left_on || ym > e.left_on.slice(0, 7))) return { lines: [], skipped: 'Enrollment is not active.' };

  const items = await q(
    `SELECT i.fee_category_id, i.amount_paise, i.frequency, i.due_day, p.plan_type, p.name AS plan_name, fc.name AS category_name, fc.kind
       FROM student_fee_plans sp JOIN fee_plans p ON p.id = sp.fee_plan_id JOIN fee_plan_items i ON i.fee_plan_id = p.id
       JOIN fee_categories fc ON fc.id = i.fee_category_id
      WHERE sp.enrollment_id = $1 AND fc.kind <> 'transport'`, [enrollmentId], c);

  // Merge by category with hostel plan taking priority over the base plan.
  const byCat = new Map<number, any>();
  for (const it of items) {
    if (it.plan_type === 'hostel' && e.residency !== 'hostel') continue;
    const prev = byCat.get(it.fee_category_id);
    if (!prev || it.plan_type === 'hostel') byCat.set(it.fee_category_id, it);
  }

  const idx = monthIndex(yStart, ym);
  const isFirst = ym === firstMonth;
  const due = (f: Frequency) => {
    switch (f) {
      case 'monthly': return true;
      case 'quarterly': return idx % 3 === 0 || isFirst;
      case 'half_yearly': return idx % 6 === 0 || isFirst;
      case 'annual': return isFirst;
      case 'one_time': return isFirst;
    }
  };
  const key = (catId: number, f: Frequency) => {
    switch (f) {
      case 'monthly': return `E${enrollmentId}:C${catId}:M${ym}`;
      case 'quarterly': return `E${enrollmentId}:C${catId}:Q${ym}`;
      case 'half_yearly': return `E${enrollmentId}:C${catId}:H${ym}`;
      case 'annual': return `E${enrollmentId}:C${catId}:Y`;
      case 'one_time': return `S${e.student_id}:C${catId}:ONCE`;
    }
  };
  const label = (f: Frequency) => ({ monthly: monthLabel(ym), quarterly: `Quarter from ${monthLabel(ym)}`, half_yearly: `Half-year from ${monthLabel(ym)}`, annual: e.year_name, one_time: 'One-time' }[f]);

  const lines: ChargeLine[] = [];
  for (const it of byCat.values()) {
    if (!due(it.frequency) || it.amount_paise <= 0) continue;
    lines.push({ feeCategoryId: it.fee_category_id, description: `${it.category_name} (${label(it.frequency)})`, amountPaise: it.amount_paise,
      discountPaise: 0, chargeKey: key(it.fee_category_id, it.frequency), dueDay: it.due_day, source: it.plan_name });
  }

  if (e.transport_opted && e.transport_route_id) {
    const r = await one('SELECT name, monthly_fee_paise FROM transport_routes WHERE id = $1', [e.transport_route_id], c);
    const cat = await one(`SELECT id, name FROM fee_categories WHERE kind = 'transport' AND is_active ORDER BY id LIMIT 1`, [], c);
    if (r && cat && r.monthly_fee_paise > 0) {
      lines.push({ feeCategoryId: cat.id, description: `${cat.name} – ${r.name} (${monthLabel(ym)})`, amountPaise: r.monthly_fee_paise,
        discountPaise: 0, chargeKey: `E${enrollmentId}:C${cat.id}:M${ym}`, dueDay: 10, source: 'transport' });
    }
  }

  const concessions = await q('SELECT * FROM concessions WHERE enrollment_id = $1 AND is_active', [enrollmentId], c);
  for (const l of lines) {
    let d = 0;
    for (const cn of concessions) {
      if (cn.fee_category_id && cn.fee_category_id !== l.feeCategoryId) continue;
      d += cn.kind === 'percent' ? percentOf(l.amountPaise, cn.percent_bp) : cn.amount_paise;
    }
    l.discountPaise = Math.min(d, l.amountPaise);
  }
  return { lines };
}

function monthIndex(startYm: string, ym: string) {
  const [a, b] = startYm.split('-').map(Number);
  const [c, d] = ym.split('-').map(Number);
  return (c - a) * 12 + (d - b);
}

async function newInvoiceNo(c: Db, yearName: string) {
  const s = await settings(c);
  const n = await nextCounter(c, `invoice:${yearName}`);
  return `${s.invoice_prefix}/${yearName}/${pad(n, 5)}`;
}

/** Idempotently generate the invoice for one enrollment and month. Safe to retry: existing charge keys are never re-billed. */
export async function generateForEnrollment(enrollmentId: number, ym: string, userId: number): Promise<{ invoiceId: number | null; added: number }> {
  return tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(1001, $1::int)', [enrollmentId]);
    const { lines } = await computeCharges(c, enrollmentId, ym);
    if (!lines.length) return { invoiceId: null, added: 0 };
    const existingKeys = new Set((await c.query(
      'SELECT charge_key FROM fee_invoice_lines WHERE charge_key = ANY($1) AND NOT is_void', [lines.map((l) => l.chargeKey)])).rows.map((r) => r.charge_key));
    const fresh = lines.filter((l) => !existingKeys.has(l.chargeKey));
    if (!fresh.length) return { invoiceId: null, added: 0 };
    const e = await one(`SELECT e.student_id, e.academic_year_id, y.name AS year_name FROM enrollments e JOIN academic_years y ON y.id = e.academic_year_id WHERE e.id = $1`, [enrollmentId], c);
    const periodKey = `M${ym}`;
    let inv = await one(`SELECT id FROM fee_invoices WHERE enrollment_id = $1 AND period_key = $2 AND status <> 'cancelled'`, [enrollmentId, periodKey], c);
    if (!inv) {
      const dueDay = Math.min(...fresh.map((l) => l.dueDay));
      inv = await one(
        `INSERT INTO fee_invoices (invoice_no, student_id, enrollment_id, academic_year_id, period_key, period_label, issue_date, due_date, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [await newInvoiceNo(c, e.year_name), e.student_id, enrollmentId, e.academic_year_id, periodKey, monthLabel(ym), todayIST(), `${ym}-${String(dueDay).padStart(2, '0')}`, userId], c);
    }
    for (const l of fresh) {
      await c.query(
        `INSERT INTO fee_invoice_lines (invoice_id, fee_category_id, description, amount_paise, discount_paise, charge_key) VALUES ($1,$2,$3,$4,$5,$6)`,
        [inv!.id, l.feeCategoryId, l.description, l.amountPaise, l.discountPaise, l.chargeKey]);
    }
    return { invoiceId: inv!.id, added: fresh.length };
  });
}

export async function generateInvoices(opts: { yearId: number; ym: string; sectionId?: number | null; enrollmentIds?: number[] | null; userId: number }) {
  const enrollments = await q(
    `SELECT e.id FROM enrollments e WHERE e.academic_year_id = $1 AND e.status = 'active'
       AND ($2::bigint IS NULL OR e.section_id = $2) AND ($3::bigint[] IS NULL OR e.id = ANY($3)) ORDER BY e.id`,
    [opts.yearId, opts.sectionId ?? null, opts.enrollmentIds ?? null]);
  let invoices = 0, lines = 0;
  for (const e of enrollments) {
    const r = await generateForEnrollment(e.id, opts.ym, opts.userId);
    if (r.added) { invoices++; lines += r.added; }
  }
  return { students: enrollments.length, invoicesTouched: invoices, linesAdded: lines };
}

/** Months from the academic year start up to and including the given month. */
export function monthsUpTo(startDate: string, endDate: string, ym: string) {
  const out: string[] = [];
  for (let m = startDate.slice(0, 7); m <= ym && m <= endDate.slice(0, 7); m = addMonths(m, 1)) out.push(m);
  return out;
}

// ---------------- Balances ----------------
export async function studentBalance(studentId: number, db: Db = pool, enrollmentId?: number | null) {
  const r = await one(
    `SELECT coalesce(sum(net_paise),0) AS billed, coalesce(sum(adjusted_paise),0) AS adjusted, coalesce(sum(paid_paise),0) AS paid,
            coalesce(sum(outstanding_paise),0) AS outstanding,
            coalesce(sum(outstanding_paise) FILTER (WHERE due_date < CURRENT_DATE),0) AS overdue,
            coalesce(sum(discount_paise),0) AS discount
       FROM fee_line_balances WHERE student_id = $1 AND ($2::bigint IS NULL OR enrollment_id = $2)`, [studentId, enrollmentId ?? null], db);
  return { ...r, cleared: r.outstanding === 0 && r.billed > 0 };
}

// ---------------- Payments ----------------
export interface PaymentInput {
  studentId: number; amountPaise: number; mode: string; reference?: string | null; paidOn: string; notes?: string | null;
  idempotencyKey: string; invoiceIds?: number[] | null;
}

export async function recordPayment(input: PaymentInput, userId: number) {
  return tx(async (c) => {
    // Serialize all payments for the same student.
    await c.query('SELECT pg_advisory_xact_lock(2002, $1::int)', [input.studentId]);
    const existing = await one('SELECT id, student_id FROM payments WHERE idempotency_key = $1', [input.idempotencyKey], c);
    if (existing) {
      if (existing.student_id !== input.studentId) throw conflict('Duplicate request key.');
      const r = await one('SELECT id, receipt_no FROM receipts WHERE payment_id = $1', [existing.id], c);
      return { paymentId: existing.id, receiptId: r.id, receiptNo: r.receipt_no, duplicate: true };
    }
    const st = await one(`SELECT id, status FROM students WHERE id = $1`, [input.studentId], c);
    if (!st) throw notFound('Student not found.');
    if (input.paidOn > todayIST()) throw badRequest('Payment date cannot be in the future.');
    if (['bank_transfer', 'upi', 'card', 'cheque'].includes(input.mode) && !input.reference) {
      throw badRequest('Enter the transaction / cheque reference for this payment mode.');
    }

    const lines = await q(
      `SELECT b.* FROM fee_line_balances b WHERE b.student_id = $1 AND b.outstanding_paise > 0
         AND ($2::bigint[] IS NULL OR b.invoice_id = ANY($2))
       ORDER BY b.due_date, b.invoice_id, b.line_id`, [input.studentId, input.invoiceIds?.length ? input.invoiceIds : null], c);
    const outstandingBefore = (await one(`SELECT coalesce(sum(outstanding_paise),0) AS o FROM fee_line_balances WHERE student_id = $1`, [input.studentId], c)).o as number;
    const selectable = lines.reduce((s, l) => s + l.outstanding_paise, 0);
    if (selectable === 0) throw badRequest('There is no outstanding balance to pay.');
    if (input.amountPaise > selectable) throw badRequest(`Amount exceeds the outstanding balance of ₹${(selectable / 100).toFixed(2)}.`);

    const pay = await one(
      `INSERT INTO payments (student_id, amount_paise, mode, reference, paid_on, received_by, notes, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [input.studentId, input.amountPaise, input.mode, input.reference ?? null, input.paidOn, userId, input.notes ?? null, input.idempotencyKey], c);

    let remaining = input.amountPaise;
    const allocated: any[] = [];
    for (const l of lines) {
      if (remaining <= 0) break;
      const amt = Math.min(remaining, l.outstanding_paise);
      await c.query('INSERT INTO payment_allocations (payment_id, invoice_line_id, amount_paise) VALUES ($1,$2,$3)', [pay.id, l.line_id, amt]);
      allocated.push({ ...l, allocated: amt });
      remaining -= amt;
    }

    // Receipt with an immutable snapshot of what was paid.
    const s = await settings(c);
    const info = await one(
      `SELECT st.student_code, st.admission_no, st.first_name, st.last_name, st.name_hi, e.roll_no, cl.name AS class_name, cl.name_hi AS class_name_hi,
              sec.name AS section_name, y.name AS year_name, e.residency,
              (SELECT g.name FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id WHERE sg.student_id = st.id ORDER BY sg.is_primary DESC LIMIT 1) AS guardian_name
         FROM students st
         LEFT JOIN LATERAL (SELECT * FROM enrollments e WHERE e.student_id = st.id ORDER BY (e.academic_year_id = (SELECT id FROM academic_years WHERE is_current)) DESC, e.enrolled_on DESC LIMIT 1) e ON true
         LEFT JOIN class_levels cl ON cl.id = e.class_level_id LEFT JOIN sections sec ON sec.id = e.section_id
         LEFT JOIN academic_years y ON y.id = e.academic_year_id
        WHERE st.id = $1`, [input.studentId], c);
    const receiver = await one('SELECT display_name FROM users WHERE id = $1', [userId], c);
    const n = await nextCounter(c, `receipt:${info.year_name ?? 'GEN'}`);
    const receiptNo = `${s.receipt_prefix}/${info.year_name ?? 'GEN'}/${pad(n, 5)}`;
    const firstDueOfPaid = allocated.length ? allocated[0].due_date : input.paidOn;
    const previousBalance = (await one(
      `SELECT coalesce(sum(outstanding_paise),0) + $3::bigint AS p FROM fee_line_balances WHERE student_id = $1 AND due_date < date_trunc('month', $2::date)`,
      [input.studentId, input.paidOn, allocated.filter((a) => a.due_date < input.paidOn.slice(0, 7) + '-01').reduce((x, a) => x + a.allocated, 0)], c)).p;
    const snapshot = {
      school: { name: s.name, nameHi: s.name_hi, address: [s.address, s.city, s.state, s.pincode].filter(Boolean).join(', '), phone: s.phone, email: s.email, logoFileId: s.logo_file_id },
      student: { id: input.studentId, code: info.student_code, admissionNo: info.admission_no, name: [info.first_name, info.last_name].filter(Boolean).join(' '),
        nameHi: info.name_hi, rollNo: info.roll_no, className: info.class_name, classNameHi: info.class_name_hi, section: info.section_name, year: info.year_name,
        guardianName: info.guardian_name, residency: info.residency },
      items: allocated.map((a) => ({ invoiceNo: a.invoice_no, description: a.description, period: a.period_label, amount: a.amount_paise, discount: a.discount_paise,
        adjusted: a.adjusted_paise, dueBefore: a.outstanding_paise, paid: a.allocated })),
      totals: {
        totalDueBefore: outstandingBefore,
        previousBalance,
        concessions: allocated.reduce((x, a) => x + a.discount_paise + a.adjusted_paise, 0),
        amountPaid: input.amountPaise,
        balanceAfter: outstandingBefore - input.amountPaise,
      },
      payment: { mode: input.mode, reference: input.reference ?? null, paidOn: input.paidOn, receivedBy: receiver?.display_name, firstDue: firstDueOfPaid },
    };
    const rc = await one('INSERT INTO receipts (receipt_no, payment_id, issued_by, snapshot) VALUES ($1,$2,$3,$4) RETURNING id',
      [receiptNo, pay.id, userId, JSON.stringify(snapshot)], c);
    await c.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details) VALUES ($1,'payment.record','payment',$2,$3)`,
      [userId, String(pay.id), JSON.stringify({ studentId: input.studentId, amount: input.amountPaise, mode: input.mode, receiptNo })]);
    return { paymentId: pay.id as number, receiptId: rc.id as number, receiptNo, duplicate: false, balanceAfter: snapshot.totals.balanceAfter };
  });
}

export async function reversePayment(paymentId: number, reason: string, userId: number) {
  return tx(async (c) => {
    const p = await one('SELECT * FROM payments WHERE id = $1 FOR UPDATE', [paymentId], c);
    if (!p) throw notFound('Payment not found.');
    if (p.status === 'reversed') throw badRequest('This payment has already been reversed.');
    const rf = await one('SELECT 1 FROM refunds WHERE payment_id = $1 LIMIT 1', [paymentId], c);
    if (rf) throw badRequest('This payment has refunds recorded against it and cannot be reversed.');
    await c.query(`UPDATE payments SET status='reversed', reversed_at=now(), reversed_by=$2, reversal_reason=$3 WHERE id=$1`, [paymentId, userId, reason]);
    await c.query(`UPDATE receipts SET status='cancelled' WHERE payment_id=$1`, [paymentId]);
    await c.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details) VALUES ($1,'payment.reverse','payment',$2,$3)`,
      [userId, String(paymentId), JSON.stringify({ reason, amount: p.amount_paise })]);
  });
}

/** Refund money from a completed payment. The refunded amount is de-allocated (latest lines first), so it becomes outstanding again unless waived. */
export async function refundPayment(paymentId: number, amountPaise: number, mode: string, reference: string | null, reason: string, userId: number) {
  return tx(async (c) => {
    const p = await one('SELECT * FROM payments WHERE id = $1 FOR UPDATE', [paymentId], c);
    if (!p) throw notFound('Payment not found.');
    if (p.status !== 'completed') throw badRequest('Only completed payments can be refunded.');
    const allocs = await q(
      `SELECT pa.invoice_line_id, pa.amount_paise - coalesce((SELECT sum(ra.amount_paise) FROM refund_allocations ra JOIN refunds r ON r.id = ra.refund_id
                WHERE r.payment_id = pa.payment_id AND ra.invoice_line_id = pa.invoice_line_id),0) AS refundable
         FROM payment_allocations pa WHERE pa.payment_id = $1 ORDER BY pa.id DESC`, [paymentId], c);
    const total = allocs.reduce((s, a) => s + a.refundable, 0);
    if (amountPaise > total) throw badRequest(`Refund cannot exceed ₹${(total / 100).toFixed(2)} remaining on this payment.`);
    const n = await nextCounter(c, 'refund');
    const r = await one(`INSERT INTO refunds (refund_no, payment_id, amount_paise, mode, reference, reason, approved_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, refund_no`,
      [`RF-${pad(n, 5)}`, paymentId, amountPaise, mode, reference, reason, userId], c);
    let rem = amountPaise;
    for (const a of allocs) {
      if (rem <= 0) break;
      const amt = Math.min(rem, a.refundable);
      if (amt <= 0) continue;
      await c.query('INSERT INTO refund_allocations (refund_id, invoice_line_id, amount_paise) VALUES ($1,$2,$3)', [r.id, a.invoice_line_id, amt]);
      rem -= amt;
    }
    await c.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details) VALUES ($1,'payment.refund','payment',$2,$3)`,
      [userId, String(paymentId), JSON.stringify({ amount: amountPaise, reason, refundNo: r.refund_no })]);
    return r;
  });
}

export async function waiveLine(lineId: number, amountPaise: number, reason: string, userId: number) {
  return tx(async (c) => {
    const l = await one('SELECT * FROM fee_line_balances WHERE line_id = $1', [lineId], c);
    if (!l) throw notFound('Fee line not found.');
    await c.query('SELECT pg_advisory_xact_lock(2002, $1::int)', [l.student_id]);
    const fresh = await one('SELECT outstanding_paise FROM fee_line_balances WHERE line_id = $1', [lineId], c);
    if (amountPaise > fresh.outstanding_paise) throw badRequest('Waiver cannot exceed the outstanding amount on this line.');
    const r = await one('INSERT INTO fee_adjustments (invoice_line_id, amount_paise, reason, approved_by) VALUES ($1,$2,$3,$4) RETURNING id', [lineId, amountPaise, reason, userId], c);
    await c.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details) VALUES ($1,'fee.waive','fee_invoice_line',$2,$3)`,
      [userId, String(lineId), JSON.stringify({ amount: amountPaise, reason })]);
    return r;
  });
}

export async function cancelInvoice(invoiceId: number, reason: string, userId: number) {
  return tx(async (c) => {
    const inv = await one('SELECT * FROM fee_invoices WHERE id = $1 FOR UPDATE', [invoiceId], c);
    if (!inv) throw notFound('Invoice not found.');
    if (inv.status === 'cancelled') throw badRequest('Invoice is already cancelled.');
    const paid = await one(`SELECT coalesce(sum(paid_paise),0) AS p, coalesce(sum(adjusted_paise),0) AS a FROM fee_line_balances WHERE invoice_id = $1`, [invoiceId], c);
    if (paid.p > 0 || paid.a > 0) throw badRequest('Payments or waivers exist on this invoice. Reverse or refund them before cancelling.');
    await c.query(`UPDATE fee_invoices SET status='cancelled', cancelled_by=$2, cancelled_at=now(), cancel_reason=$3 WHERE id=$1`, [invoiceId, userId, reason]);
    // Void lines so the same charges can be re-generated correctly later.
    await c.query('UPDATE fee_invoice_lines SET is_void = true WHERE invoice_id = $1', [invoiceId]);
    await c.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details) VALUES ($1,'invoice.cancel','fee_invoice',$2,$3)`,
      [userId, String(invoiceId), JSON.stringify({ reason })]);
  });
}

/** Ad-hoc charge (e.g. replacement ID card) as its own invoice. */
export async function addManualCharge(enrollmentId: number, feeCategoryId: number, amountPaise: number, description: string, dueDate: string, userId: number) {
  return tx(async (c) => {
    const e = await one(`SELECT e.student_id, e.academic_year_id, y.name AS year_name FROM enrollments e JOIN academic_years y ON y.id = e.academic_year_id WHERE e.id = $1`, [enrollmentId], c);
    if (!e) throw notFound('Enrollment not found.');
    const cat = await one('SELECT name FROM fee_categories WHERE id = $1', [feeCategoryId], c);
    if (!cat) throw badRequest('Unknown fee category.');
    const key = `MANUAL:${crypto.randomUUID()}`;
    const inv = await one(
      `INSERT INTO fee_invoices (invoice_no, student_id, enrollment_id, academic_year_id, period_key, period_label, issue_date, due_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, invoice_no`,
      [await newInvoiceNo(c, e.year_name), e.student_id, enrollmentId, e.academic_year_id, key, 'Additional charge', todayIST(), dueDate, userId], c);
    await c.query('INSERT INTO fee_invoice_lines (invoice_id, fee_category_id, description, amount_paise, charge_key) VALUES ($1,$2,$3,$4,$5)',
      [inv.id, feeCategoryId, description || cat.name, amountPaise, key]);
    await c.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details) VALUES ($1,'invoice.manual','fee_invoice',$2,$3)`,
      [userId, String(inv.id), JSON.stringify({ amount: amountPaise, description })]);
    return inv;
  });
}

export type { PoolClient };

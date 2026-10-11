import { Router, type Request } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { one, pool, q, tx } from '../db/pool.js';
import { ah, badRequest, forbidden, notFound } from '../lib/errors.js';
import { can, requirePerm } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { crud } from '../lib/crud.js';
import { bool, date, id, optDate, optId, optStr, rupees, str } from '../lib/validate.js';
import { resolveYear, settings } from '../lib/context.js';
import { addMonths, todayIST } from '../lib/dates.js';
import {
  addManualCharge, cancelInvoice, computeCharges, generateInvoices, recordPayment, refundPayment, reversePayment, studentBalance, waiveLine,
} from '../services/fees.js';
import { renderReceiptPdf } from '../pdf/receipt.js';

export const feesRouter = Router();
const FREQ = z.enum(['one_time', 'monthly', 'quarterly', 'half_yearly', 'annual']);
const MODE = z.enum(['cash', 'bank_transfer', 'upi', 'card', 'cheque', 'other']);
const ym = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');

// ---------- Categories ----------
crud(feesRouter, { path: '/categories', table: 'fee_categories', perm: 'fees.manage', readPerm: 'fees.view', orderBy: 'id',
  schema: z.object({ code: z.string().trim().regex(/^[A-Z0-9_]{2,20}$/), name: str(100), nameHi: optStr(100),
    kind: z.enum(['admission', 'tuition', 'preschool_course', 'annual', 'exam', 'hostel', 'transport', 'uniform', 'books', 'activity', 'other']),
    defaultFrequency: FREQ, isRefundable: bool.optional(), isActive: bool.optional() }) });

// ---------- Transport routes ----------
const routeSchema = z.object({ name: str(100), description: optStr(500), stops: optStr(2000), vehicleNo: optStr(30), driverName: optStr(100), driverPhone: optStr(30),
  monthlyFee: rupees, isActive: bool.optional() });
feesRouter.get('/routes', requirePerm('fees.view', 'transport.manage', 'students.manage'), ah(async (_req, res) => {
  res.json(await q(`SELECT r.*, (SELECT count(*) FROM enrollments e JOIN academic_years y ON y.id = e.academic_year_id AND y.is_current
                                   WHERE e.transport_route_id = r.id AND e.transport_opted AND e.status = 'active') AS riders
                      FROM transport_routes r ORDER BY r.name`));
}));
feesRouter.post('/routes', requirePerm('transport.manage'), ah(async (req, res) => {
  const b = routeSchema.parse(req.body);
  const r = await one(`INSERT INTO transport_routes (name, description, stops, vehicle_no, driver_name, driver_phone, monthly_fee_paise) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [b.name, b.description, b.stops, b.vehicleNo, b.driverName, b.driverPhone, b.monthlyFee]);
  await audit(req, 'transport_route.create', 'transport_route', r.id, b);
  res.status(201).json(r);
}));
feesRouter.put('/routes/:id', requirePerm('transport.manage'), ah(async (req, res) => {
  const b = routeSchema.parse(req.body);
  const r = await one(`UPDATE transport_routes SET name=$2, description=$3, stops=$4, vehicle_no=$5, driver_name=$6, driver_phone=$7, monthly_fee_paise=$8, is_active=coalesce($9,is_active) WHERE id=$1 RETURNING *`,
    [id.parse(req.params.id), b.name, b.description, b.stops, b.vehicleNo, b.driverName, b.driverPhone, b.monthlyFee, b.isActive ?? null]);
  if (!r) throw notFound();
  await audit(req, 'transport_route.update', 'transport_route', r.id, b);
  res.json(r);
}));
feesRouter.get('/routes/:id/riders', requirePerm('transport.manage', 'fees.view'), ah(async (req, res) => {
  res.json(await q(`SELECT st.id, st.first_name, st.last_name, st.student_code, cl.name AS class_name, sec.name AS section_name, e.roll_no
                      FROM enrollments e JOIN academic_years y ON y.id = e.academic_year_id AND y.is_current JOIN students st ON st.id = e.student_id
                      JOIN class_levels cl ON cl.id = e.class_level_id JOIN sections sec ON sec.id = e.section_id
                     WHERE e.transport_route_id = $1 AND e.transport_opted AND e.status = 'active' ORDER BY cl.sort_order, sec.name, e.roll_no`, [id.parse(req.params.id)]));
}));

// ---------- Fee plans ----------
const planSchema = z.object({
  academicYearId: id, name: str(120), planType: z.enum(['preschool', 'school', 'hostel']), classLevelId: optId, description: optStr(500), isActive: bool.optional(),
  items: z.array(z.object({ feeCategoryId: id, amount: rupees, frequency: FREQ, dueDay: z.coerce.number().int().min(1).max(28).default(10) })).max(30),
});
async function validatePlan(b: z.infer<typeof planSchema>) {
  if (new Set(b.items.map((i) => i.feeCategoryId)).size !== b.items.length) throw badRequest('Each fee category can appear only once in a plan.');
  const cats = await q('SELECT id, kind, name FROM fee_categories WHERE id = ANY($1)', [b.items.map((i) => i.feeCategoryId)]);
  for (const cat of cats) {
    if (cat.kind === 'transport') throw badRequest('Transport is charged from the student\'s route, only when transport is selected. Remove it from the plan.');
    if (cat.kind === 'hostel' && b.planType !== 'hostel') throw badRequest(`"${cat.name}" is a hostel charge and belongs in a hostel plan.`);
    if (cat.kind === 'preschool_course' && b.planType !== 'preschool') throw badRequest(`"${cat.name}" belongs in a preschool plan.`);
  }
  if (cats.length !== b.items.length) throw badRequest('Unknown fee category.');
  if (b.classLevelId) {
    const cl = await one('SELECT is_preschool FROM class_levels WHERE id=$1', [b.classLevelId]);
    if (!cl) throw badRequest('Unknown class.');
    if (b.planType === 'preschool' && !cl.is_preschool) throw badRequest('Preschool plans must be for a preschool class.');
    if (b.planType === 'school' && cl.is_preschool) throw badRequest('Use a preschool plan for preschool classes.');
  }
}
feesRouter.get('/plans', requirePerm('fees.view', 'students.manage'), ah(async (req, res) => {
  const y = await resolveYear(req.query.yearId);
  const plans = await q(
    `SELECT p.*, cl.name AS class_name, (SELECT count(*) FROM student_fee_plans sp WHERE sp.fee_plan_id = p.id) AS students
       FROM fee_plans p LEFT JOIN class_levels cl ON cl.id = p.class_level_id WHERE p.academic_year_id = $1 ORDER BY p.plan_type, cl.sort_order NULLS FIRST, p.name`, [y.id]);
  const items = await q(
    `SELECT i.*, fc.name AS category_name, fc.kind FROM fee_plan_items i JOIN fee_categories fc ON fc.id = i.fee_category_id
      WHERE i.fee_plan_id = ANY($1) ORDER BY fc.id`, [plans.map((p) => p.id)]);
  res.json(plans.map((p) => ({ ...p, items: items.filter((i) => i.fee_plan_id === p.id) })));
}));
feesRouter.post('/plans', requirePerm('fees.manage'), ah(async (req, res) => {
  const b = planSchema.parse(req.body);
  await validatePlan(b);
  const out = await tx(async (c) => {
    const p = await one(`INSERT INTO fee_plans (academic_year_id, name, plan_type, class_level_id, description) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [b.academicYearId, b.name, b.planType, b.classLevelId, b.description], c);
    for (const i of b.items) {
      await c.query('INSERT INTO fee_plan_items (fee_plan_id, fee_category_id, amount_paise, frequency, due_day) VALUES ($1,$2,$3,$4,$5)', [p.id, i.feeCategoryId, i.amount, i.frequency, i.dueDay]);
    }
    await audit(req, 'fee_plan.create', 'fee_plan', p.id, b, c);
    return p;
  });
  res.status(201).json(out);
}));
feesRouter.put('/plans/:id', requirePerm('fees.manage'), ah(async (req, res) => {
  const pid = id.parse(req.params.id);
  const b = planSchema.parse(req.body);
  await validatePlan(b);
  await tx(async (c) => {
    const p = await one('SELECT * FROM fee_plans WHERE id=$1 FOR UPDATE', [pid], c);
    if (!p) throw notFound();
    if (p.plan_type !== b.planType) {
      const used = await one('SELECT 1 FROM student_fee_plans WHERE fee_plan_id=$1 LIMIT 1', [pid], c);
      if (used) throw badRequest('The plan type cannot change while students are assigned to it.');
    }
    await c.query('UPDATE fee_plans SET name=$2, plan_type=$3, class_level_id=$4, description=$5, is_active=coalesce($6,is_active) WHERE id=$1',
      [pid, b.name, b.planType, b.classLevelId, b.description, b.isActive ?? null]);
    await c.query('DELETE FROM fee_plan_items WHERE fee_plan_id=$1', [pid]);
    for (const i of b.items) {
      await c.query('INSERT INTO fee_plan_items (fee_plan_id, fee_category_id, amount_paise, frequency, due_day) VALUES ($1,$2,$3,$4,$5)', [pid, i.feeCategoryId, i.amount, i.frequency, i.dueDay]);
    }
    await audit(req, 'fee_plan.update', 'fee_plan', pid, b, c);
  });
  res.json({ ok: true, note: 'Changes apply to invoices generated from now on. Existing invoices are not altered.' });
}));
feesRouter.post('/plans/:id/assign', requirePerm('fees.manage'), ah(async (req, res) => {
  const pid = id.parse(req.params.id);
  const { enrollmentIds } = z.object({ enrollmentIds: z.array(id).min(1).max(600) }).parse(req.body);
  const { assignPlan } = await import('../services/fees.js');
  await tx(async (c) => {
    for (const e of enrollmentIds) await assignPlan(c, e, pid, req.user!.id);
    await audit(req, 'fee_plan.assign', 'fee_plan', pid, { count: enrollmentIds.length }, c);
  });
  res.json({ ok: true, assigned: enrollmentIds.length });
}));

/** Preview what an enrollment would be billed for a month (no data is written). */
feesRouter.get('/preview', requirePerm('fees.view'), ah(async (req, res) => {
  const f = z.object({ enrollmentId: id, month: ym }).parse(req.query);
  res.json(await computeCharges(pool, f.enrollmentId, f.month));
}));

// ---------- Concessions / scholarships ----------
feesRouter.get('/concessions', requirePerm('fees.view'), ah(async (req, res) => {
  const y = await resolveYear(req.query.yearId);
  res.json(await q(
    `SELECT c.*, fc.name AS category_name, st.first_name, st.last_name, st.student_code, cl.name AS class_name, sec.name AS section_name, u.display_name AS approved_by_name
       FROM concessions c JOIN enrollments e ON e.id = c.enrollment_id JOIN students st ON st.id = e.student_id
       JOIN class_levels cl ON cl.id = e.class_level_id JOIN sections sec ON sec.id = e.section_id
       LEFT JOIN fee_categories fc ON fc.id = c.fee_category_id LEFT JOIN users u ON u.id = c.approved_by
      WHERE e.academic_year_id = $1 AND ($2::bigint IS NULL OR e.student_id = $2) ORDER BY c.created_at DESC`, [y.id, req.query.studentId ? Number(req.query.studentId) : null]));
}));
feesRouter.post('/concessions', requirePerm('fees.manage'), ah(async (req, res) => {
  const b = z.object({ enrollmentId: id, feeCategoryId: optId, label: z.enum(['concession', 'scholarship', 'discount']), kind: z.enum(['percent', 'fixed']),
    percent: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().min(0.01).max(100).nullable()), amount: z.preprocess((v) => (v === '' || v == null ? null : v), rupees.nullable()),
    reason: str(300) }).parse(req.body);
  if (b.kind === 'percent' && !b.percent) throw badRequest('Enter a percentage.');
  if (b.kind === 'fixed' && !b.amount) throw badRequest('Enter an amount.');
  const r = await one(
    `INSERT INTO concessions (enrollment_id, fee_category_id, label, kind, percent_bp, amount_paise, reason, approved_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [b.enrollmentId, b.feeCategoryId, b.label, b.kind, b.kind === 'percent' ? Math.round(b.percent! * 100) : null, b.kind === 'fixed' ? b.amount : null, b.reason, req.user!.id]);
  await audit(req, 'concession.create', 'concession', r.id, b);
  res.status(201).json({ ...r, note: 'Applies to invoices generated from now on. Use a waiver for already-issued invoices.' });
}));
feesRouter.post('/concessions/:id/deactivate', requirePerm('fees.manage'), ah(async (req, res) => {
  const cid = id.parse(req.params.id);
  const r = await one('UPDATE concessions SET is_active=false WHERE id=$1 RETURNING id', [cid]);
  if (!r) throw notFound();
  await audit(req, 'concession.deactivate', 'concession', cid);
  res.json({ ok: true });
}));

// ---------- Invoices ----------
feesRouter.post('/invoices/generate', requirePerm('fees.manage'), ah(async (req, res) => {
  const b = z.object({ yearId: optId, fromMonth: ym, toMonth: ym, sectionId: optId, enrollmentIds: z.array(id).max(600).optional() }).parse(req.body);
  const y = await resolveYear(b.yearId);
  if (b.toMonth < b.fromMonth) throw badRequest('End month must be on or after start month.');
  if (b.fromMonth < y.start_date.slice(0, 7) || b.toMonth > y.end_date.slice(0, 7)) throw badRequest('Months must fall within the academic year.');
  const totals = { students: 0, invoicesTouched: 0, linesAdded: 0, months: 0 };
  for (let m = b.fromMonth; m <= b.toMonth; m = addMonths(m, 1)) {
    const r = await generateInvoices({ yearId: y.id, ym: m, sectionId: b.sectionId, enrollmentIds: b.enrollmentIds ?? null, userId: req.user!.id });
    totals.students = r.students; totals.invoicesTouched += r.invoicesTouched; totals.linesAdded += r.linesAdded; totals.months++;
  }
  await audit(req, 'invoice.generate', 'academic_year', y.id, { ...b, ...totals });
  res.json(totals);
}));
feesRouter.get('/invoices', requirePerm('fees.view'), ah(async (req, res) => {
  const f = z.object({ yearId: optId.optional(), studentId: optId.optional(), sectionId: optId.optional(), status: z.enum(['unpaid', 'paid', 'cancelled', 'all']).default('all'),
    search: optStr(80).optional() }).parse(Object.fromEntries(Object.entries(req.query).filter(([, v]) => v !== '')));
  const y = await resolveYear(f.yearId);
  res.json(await q(
    `SELECT i.id, i.invoice_no, i.period_label, i.issue_date, i.due_date, i.status, i.student_id, st.first_name, st.last_name, st.student_code,
            cl.name AS class_name, sec.name AS section_name, e.roll_no,
            coalesce(b.net,0) AS net_paise, coalesce(b.paid,0) AS paid_paise, coalesce(b.adjusted,0) AS adjusted_paise, coalesce(b.outstanding,0) AS outstanding_paise
       FROM fee_invoices i JOIN students st ON st.id = i.student_id JOIN enrollments e ON e.id = i.enrollment_id
       JOIN class_levels cl ON cl.id = e.class_level_id JOIN sections sec ON sec.id = e.section_id
       LEFT JOIN LATERAL (SELECT sum(net_paise) net, sum(paid_paise) paid, sum(adjusted_paise) adjusted, sum(outstanding_paise) outstanding FROM fee_line_balances WHERE invoice_id = i.id) b ON true
      WHERE i.academic_year_id = $1 AND ($2::bigint IS NULL OR i.student_id = $2) AND ($3::bigint IS NULL OR e.section_id = $3)
        AND ($4 = 'all' OR ($4 = 'cancelled' AND i.status = 'cancelled') OR ($4 = 'unpaid' AND i.status <> 'cancelled' AND coalesce(b.outstanding,0) > 0)
             OR ($4 = 'paid' AND i.status <> 'cancelled' AND coalesce(b.outstanding,0) = 0))
        AND ($5::text IS NULL OR i.invoice_no ILIKE '%' || $5 || '%' OR st.student_code ILIKE $5 || '%' OR st.first_name || ' ' || coalesce(st.last_name,'') ILIKE '%' || $5 || '%')
      ORDER BY i.due_date DESC, i.id DESC LIMIT 2000`, [y.id, f.studentId ?? null, f.sectionId ?? null, f.status, f.search ?? null]));
}));
feesRouter.post('/invoices/:id/cancel', requirePerm('fees.manage'), ah(async (req, res) => {
  const { reason } = z.object({ reason: str(300) }).parse(req.body);
  await cancelInvoice(id.parse(req.params.id), reason, req.user!.id);
  res.json({ ok: true });
}));
feesRouter.post('/manual-charge', requirePerm('fees.manage'), ah(async (req, res) => {
  const b = z.object({ enrollmentId: id, feeCategoryId: id, amount: rupees, description: str(200), dueDate: date }).parse(req.body);
  if (b.amount <= 0) throw badRequest('Amount must be greater than zero.');
  res.status(201).json(await addManualCharge(b.enrollmentId, b.feeCategoryId, b.amount, b.description, b.dueDate, req.user!.id));
}));
feesRouter.post('/lines/:id/waive', requirePerm('fees.refund'), ah(async (req, res) => {
  const b = z.object({ amount: rupees, reason: str(300) }).parse(req.body);
  if (b.amount <= 0) throw badRequest('Amount must be greater than zero.');
  res.status(201).json(await waiveLine(id.parse(req.params.id), b.amount, b.reason, req.user!.id));
}));

// ---------- Student statement ----------
async function assertFeeAccess(req: Request, studentId: number) {
  if (can(req, 'fees.view')) return;
  if (req.user!.role === 'student' && req.user!.studentId === studentId && (await settings()).show_fees_to_students) return;
  throw forbidden('You do not have access to these fee records.');
}
export async function statement(studentId: number) {
  const lines = await q(
    `SELECT b.*, fc.name AS category_name, fc.name_hi AS category_name_hi, i.status AS invoice_status, i.issue_date, y.name AS year_name
       FROM fee_line_balances b JOIN fee_categories fc ON fc.id = b.fee_category_id JOIN fee_invoices i ON i.id = b.invoice_id
       JOIN academic_years y ON y.id = b.academic_year_id WHERE b.student_id = $1 ORDER BY b.due_date, b.invoice_id, b.line_id`, [studentId]);
  const invoices = new Map<number, any>();
  for (const l of lines) {
    if (!invoices.has(l.invoice_id)) {
      invoices.set(l.invoice_id, { id: l.invoice_id, invoice_no: l.invoice_no, period_label: l.period_label, due_date: l.due_date, issue_date: l.issue_date,
        year_name: l.year_name, lines: [], net_paise: 0, paid_paise: 0, adjusted_paise: 0, outstanding_paise: 0 });
    }
    const inv = invoices.get(l.invoice_id);
    inv.lines.push(l);
    inv.net_paise += l.net_paise; inv.paid_paise += l.paid_paise; inv.adjusted_paise += l.adjusted_paise; inv.outstanding_paise += l.outstanding_paise;
  }
  const payments = await q(
    `SELECT p.id, p.amount_paise, p.mode, p.reference, p.paid_on, p.status, p.created_at, p.reversal_reason, r.id AS receipt_id, r.receipt_no, r.status AS receipt_status,
            u.display_name AS received_by_name, coalesce((SELECT sum(amount_paise) FROM refunds WHERE payment_id = p.id),0) AS refunded_paise
       FROM payments p LEFT JOIN receipts r ON r.payment_id = p.id LEFT JOIN users u ON u.id = p.received_by
      WHERE p.student_id = $1 ORDER BY p.paid_on DESC, p.id DESC`, [studentId]);
  const refunds = await q(`SELECT rf.* FROM refunds rf JOIN payments p ON p.id = rf.payment_id WHERE p.student_id = $1 ORDER BY rf.created_at DESC`, [studentId]);
  return { invoices: [...invoices.values()], payments, refunds, balance: await studentBalance(studentId) };
}
feesRouter.get('/students/:id/statement', ah(async (req, res) => {
  const sid = id.parse(req.params.id);
  await assertFeeAccess(req, sid);
  const st = await one(
    `SELECT st.id, st.first_name, st.last_name, st.student_code, st.admission_no, st.status, e.id AS enrollment_id, e.roll_no, e.residency, e.transport_opted,
            cl.name AS class_name, cl.is_preschool, sec.name AS section_name, y.name AS year_name, r.name AS route_name
       FROM students st LEFT JOIN enrollments e ON e.student_id = st.id AND e.academic_year_id = (SELECT id FROM academic_years WHERE is_current)
       LEFT JOIN class_levels cl ON cl.id = e.class_level_id LEFT JOIN sections sec ON sec.id = e.section_id
       LEFT JOIN academic_years y ON y.id = e.academic_year_id LEFT JOIN transport_routes r ON r.id = e.transport_route_id WHERE st.id = $1`, [sid]);
  if (!st) throw notFound();
  res.json({ student: st, ...(await statement(sid)) });
}));

// ---------- Payments ----------
feesRouter.post('/payments', requirePerm('fees.collect'), ah(async (req, res) => {
  const b = z.object({ studentId: id, amount: rupees, mode: MODE, reference: optStr(100), paidOn: date.default(() => todayIST()), notes: optStr(500),
    idempotencyKey: z.string().min(8).max(100).default(() => crypto.randomUUID()), invoiceIds: z.array(id).max(50).optional() }).parse(req.body);
  if (b.amount <= 0) throw badRequest('Amount must be greater than zero.');
  const r = await recordPayment({ studentId: b.studentId, amountPaise: b.amount, mode: b.mode, reference: b.reference, paidOn: b.paidOn, notes: b.notes,
    idempotencyKey: b.idempotencyKey, invoiceIds: b.invoiceIds }, req.user!.id);
  res.status(r.duplicate ? 200 : 201).json(r);
}));
feesRouter.get('/payments', requirePerm('fees.view'), ah(async (req, res) => {
  const f = z.object({ from: optDate, to: optDate, mode: MODE.optional(), studentId: optId.optional(), status: z.enum(['completed', 'reversed']).optional() })
    .parse(Object.fromEntries(Object.entries(req.query).filter(([, v]) => v !== '')));
  res.json(await q(
    `SELECT p.*, r.id AS receipt_id, r.receipt_no, st.first_name, st.last_name, st.student_code, u.display_name AS received_by_name,
            coalesce((SELECT sum(amount_paise) FROM refunds WHERE payment_id = p.id),0) AS refunded_paise
       FROM payments p JOIN students st ON st.id = p.student_id LEFT JOIN receipts r ON r.payment_id = p.id LEFT JOIN users u ON u.id = p.received_by
      WHERE ($1::date IS NULL OR p.paid_on >= $1) AND ($2::date IS NULL OR p.paid_on <= $2) AND ($3::text IS NULL OR p.mode = $3)
        AND ($4::bigint IS NULL OR p.student_id = $4) AND ($5::text IS NULL OR p.status = $5)
      ORDER BY p.paid_on DESC, p.id DESC LIMIT 3000`, [f.from ?? null, f.to ?? null, f.mode ?? null, f.studentId ?? null, f.status ?? null]));
}));
feesRouter.post('/payments/:id/reverse', requirePerm('fees.refund'), ah(async (req, res) => {
  const { reason } = z.object({ reason: str(300) }).parse(req.body);
  await reversePayment(id.parse(req.params.id), reason, req.user!.id);
  res.json({ ok: true });
}));
feesRouter.post('/payments/:id/refund', requirePerm('fees.refund'), ah(async (req, res) => {
  const b = z.object({ amount: rupees, mode: MODE, reference: optStr(100), reason: str(300) }).parse(req.body);
  if (b.amount <= 0) throw badRequest('Amount must be greater than zero.');
  res.status(201).json(await refundPayment(id.parse(req.params.id), b.amount, b.mode, b.reference, b.reason, req.user!.id));
}));

// ---------- Receipts ----------
feesRouter.get('/receipts', requirePerm('fees.view'), ah(async (req, res) => {
  const f = z.object({ search: optStr(80).optional(), from: optDate.optional(), to: optDate.optional() }).parse(Object.fromEntries(Object.entries(req.query).filter(([, v]) => v !== '')));
  res.json(await q(
    `SELECT r.id, r.receipt_no, r.issued_at, r.status, r.print_count, p.amount_paise, p.mode, p.paid_on, p.reference,
            st.id AS student_id, st.first_name, st.last_name, st.student_code, st.admission_no, r.snapshot->'student'->>'rollNo' AS roll_no,
            r.snapshot->'student'->>'className' AS class_name, r.snapshot->'student'->>'section' AS section_name
       FROM receipts r JOIN payments p ON p.id = r.payment_id JOIN students st ON st.id = p.student_id
      WHERE ($1::date IS NULL OR p.paid_on >= $1) AND ($2::date IS NULL OR p.paid_on <= $2)
        AND ($3::text IS NULL OR r.receipt_no ILIKE '%' || $3 || '%' OR st.student_code ILIKE $3 || '%' OR st.admission_no ILIKE '%' || $3 || '%'
             OR r.snapshot->'student'->>'rollNo' = $3 OR st.first_name || ' ' || coalesce(st.last_name,'') ILIKE '%' || $3 || '%')
      ORDER BY r.issued_at DESC LIMIT 1000`, [f.from ?? null, f.to ?? null, f.search ?? null]));
}));
async function loadReceipt(req: Request, rid: number) {
  const r = await one(`SELECT r.*, p.student_id, p.status AS payment_status FROM receipts r JOIN payments p ON p.id = r.payment_id WHERE r.id = $1`, [rid]);
  if (!r) throw notFound('Receipt not found.');
  await assertFeeAccess(req, r.student_id);
  return r;
}
feesRouter.get('/receipts/:id', ah(async (req, res) => {
  res.json(await loadReceipt(req, id.parse(req.params.id)));
}));
feesRouter.get('/receipts/:id/pdf', ah(async (req, res) => {
  const r = await loadReceipt(req, id.parse(req.params.id));
  const lang = req.query.lang === 'hi' ? 'hi' : 'en';
  const logo = r.snapshot.school.logoFileId ? await one('SELECT data, mime_type FROM files WHERE id = $1', [r.snapshot.school.logoFileId]) : null;
  const pdf = await renderReceiptPdf(r, lang, logo?.mime_type !== 'image/webp' ? logo?.data : null);
  if (req.user!.role !== 'student') await pool.query('UPDATE receipts SET print_count = print_count + 1 WHERE id = $1', [r.id]);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="receipt-${r.receipt_no.replace(/\//g, '-')}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
}));
feesRouter.post('/receipts/:id/printed', requirePerm('fees.view'), ah(async (req, res) => {
  await pool.query('UPDATE receipts SET print_count = print_count + 1 WHERE id = $1', [id.parse(req.params.id)]);
  res.json({ ok: true });
}));

// ---------- Reports ----------
feesRouter.get('/reports/collections', requirePerm('fees.view'), ah(async (req, res) => {
  const f = z.object({ from: date.default(() => todayIST()), to: date.default(() => todayIST()) }).parse(Object.fromEntries(Object.entries(req.query).filter(([, v]) => v !== '')));
  const [daily, byMode, byClass, byCategory, totals] = await Promise.all([
    q(`SELECT paid_on AS date, count(*) AS payments, sum(amount_paise) AS amount_paise FROM payments WHERE status='completed' AND paid_on BETWEEN $1 AND $2 GROUP BY paid_on ORDER BY paid_on`, [f.from, f.to]),
    q(`SELECT mode, count(*) AS payments, sum(amount_paise) AS amount_paise FROM payments WHERE status='completed' AND paid_on BETWEEN $1 AND $2 GROUP BY mode ORDER BY 3 DESC`, [f.from, f.to]),
    q(`SELECT cl.name AS class_name, cl.sort_order, sum(pa.amount_paise) AS amount_paise FROM payments p JOIN payment_allocations pa ON pa.payment_id = p.id
         JOIN fee_invoice_lines l ON l.id = pa.invoice_line_id JOIN fee_invoices i ON i.id = l.invoice_id JOIN enrollments e ON e.id = i.enrollment_id
         JOIN class_levels cl ON cl.id = e.class_level_id WHERE p.status='completed' AND p.paid_on BETWEEN $1 AND $2 GROUP BY cl.name, cl.sort_order ORDER BY cl.sort_order`, [f.from, f.to]),
    q(`SELECT fc.name AS category, sum(pa.amount_paise) AS amount_paise FROM payments p JOIN payment_allocations pa ON pa.payment_id = p.id
         JOIN fee_invoice_lines l ON l.id = pa.invoice_line_id JOIN fee_categories fc ON fc.id = l.fee_category_id
        WHERE p.status='completed' AND p.paid_on BETWEEN $1 AND $2 GROUP BY fc.name ORDER BY 2 DESC`, [f.from, f.to]),
    one(`SELECT coalesce(sum(amount_paise),0) AS collected, count(*) AS payments,
                (SELECT coalesce(sum(amount_paise),0) FROM refunds WHERE created_at::date BETWEEN $1 AND $2) AS refunded
           FROM payments WHERE status='completed' AND paid_on BETWEEN $1 AND $2`, [f.from, f.to]),
  ]);
  res.json({ from: f.from, to: f.to, daily, byMode, byClass, byCategory, totals });
}));
feesRouter.get('/reports/outstanding', requirePerm('fees.view'), ah(async (req, res) => {
  const f = z.object({ yearId: optId.optional(), sectionId: optId.optional(), overdueOnly: bool.optional() }).parse(Object.fromEntries(Object.entries(req.query).filter(([, v]) => v !== '')));
  const y = await resolveYear(f.yearId);
  const rows = await q(
    `SELECT st.id AS student_id, st.first_name, st.last_name, st.student_code, st.admission_no, e.roll_no, cl.name AS class_name, cl.sort_order, sec.name AS section_name,
            (SELECT g.phone FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id WHERE sg.student_id = st.id ORDER BY sg.is_primary DESC LIMIT 1) AS guardian_phone,
            sum(b.net_paise) AS billed_paise, sum(b.paid_paise) AS paid_paise, sum(b.adjusted_paise) AS adjusted_paise, sum(b.outstanding_paise) AS outstanding_paise,
            sum(b.outstanding_paise) FILTER (WHERE b.due_date < CURRENT_DATE) AS overdue_paise, min(b.due_date) FILTER (WHERE b.outstanding_paise > 0) AS oldest_due
       FROM fee_line_balances b JOIN enrollments e ON e.id = b.enrollment_id JOIN students st ON st.id = b.student_id
       JOIN class_levels cl ON cl.id = e.class_level_id JOIN sections sec ON sec.id = e.section_id
      WHERE b.academic_year_id = $1 AND ($2::bigint IS NULL OR e.section_id = $2)
      GROUP BY st.id, e.roll_no, cl.name, cl.sort_order, sec.name
     HAVING sum(b.outstanding_paise) ${f.overdueOnly ? 'FILTER (WHERE b.due_date < CURRENT_DATE)' : ''} > 0
      ORDER BY cl.sort_order, sec.name, e.roll_no`, [y.id, f.sectionId ?? null]);
  const byClass = await q(
    `SELECT cl.name AS class_name, cl.sort_order, sum(b.net_paise) AS billed_paise, sum(b.paid_paise) AS paid_paise, sum(b.outstanding_paise) AS outstanding_paise
       FROM fee_line_balances b JOIN enrollments e ON e.id = b.enrollment_id JOIN class_levels cl ON cl.id = e.class_level_id
      WHERE b.academic_year_id = $1 GROUP BY cl.name, cl.sort_order ORDER BY cl.sort_order`, [y.id]);
  res.json({ students: rows, byClass });
}));

/** Queue fee reminders. Messages are only marked sent when a configured provider confirms delivery. */
feesRouter.post('/reminders', requirePerm('fees.manage'), ah(async (req, res) => {
  const b = z.object({ studentIds: z.array(id).min(1).max(600), channel: z.enum(['sms', 'whatsapp', 'email']), message: optStr(500).optional() }).parse(req.body);
  const s = await settings();
  const providerConfigured = { sms: !!process.env.SMS_API_URL, whatsapp: !!process.env.WHATSAPP_API_URL, email: !!process.env.SMTP_URL }[b.channel];
  let queued = 0, skipped = 0;
  for (const sid of b.studentIds) {
    const r = await one(
      `SELECT st.first_name, g.phone, g.email, (SELECT coalesce(sum(outstanding_paise),0) FROM fee_line_balances WHERE student_id = st.id) AS outstanding
         FROM students st LEFT JOIN LATERAL (SELECT g.* FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id WHERE sg.student_id = st.id ORDER BY sg.is_primary DESC LIMIT 1) g ON true
        WHERE st.id = $1`, [sid]);
    const to = b.channel === 'email' ? r?.email : r?.phone;
    if (!r || !to || r.outstanding <= 0) { skipped++; continue; }
    const body = b.message || `Dear Parent, fees of ₹${(r.outstanding / 100).toFixed(2)} are pending for ${r.first_name}. Kindly pay at the earliest. – ${s.name}`;
    await pool.query(`INSERT INTO message_outbox (channel, recipient, subject, body, status, related_type, related_id, created_by) VALUES ($1,$2,$3,$4,$5,'student',$6,$7)`,
      [b.channel, to, 'Fee reminder', body, providerConfigured ? 'queued' : 'not_configured', String(sid), req.user!.id]);
    queued++;
  }
  await audit(req, 'fees.reminders', 'message_outbox', null, { channel: b.channel, queued, skipped });
  res.json({ queued, skipped, providerConfigured,
    note: providerConfigured ? 'Messages queued for delivery.' : 'No messaging provider is configured, so messages were recorded but NOT sent. See README > Messaging.' });
}));

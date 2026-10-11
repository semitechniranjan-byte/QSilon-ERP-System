import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { q } from '../db/pool.js';
import { ah, badRequest, forbidden } from '../lib/errors.js';
import { assertSectionAccess, can } from '../middleware/auth.js';
import { resolveYear } from '../lib/context.js';
import { optDate, optId } from '../lib/validate.js';
import { todayIST } from '../lib/dates.js';
import { PCT_SQL } from '../lib/sql.js';
import { computeResults } from '../services/results.js';
import { audit } from '../lib/audit.js';

export const reportsRouter = Router();

type Col = { key: string; header: string; money?: boolean };
interface Report { title: string; columns: Col[]; rows: any[] }

const rupees = (p: number | null | undefined) => (p == null ? '' : (Number(p) / 100).toFixed(2));

function toCsv(r: Report) {
  const esc = (v: unknown) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralize spreadsheet formula injection
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [r.columns.map((c) => esc(c.header)).join(',')];
  for (const row of r.rows) lines.push(r.columns.map((c) => esc(c.money ? rupees(row[c.key]) : row[c.key])).join(','));
  return '﻿' + lines.join('\r\n');
}
async function toXlsx(r: Report) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(r.title.slice(0, 30));
  ws.columns = r.columns.map((c) => ({ header: c.header, key: c.key, width: Math.max(12, c.header.length + 4), style: c.money ? { numFmt: '#,##0.00' } : undefined }));
  for (const row of r.rows) {
    const o: Record<string, unknown> = {};
    for (const c of r.columns) {
      const v = row[c.key];
      o[c.key] = c.money ? (v == null ? null : Number(v) / 100) : typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v;
    }
    ws.addRow(o);
  }
  ws.getRow(1).font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
async function send(res: Response, req: Request, r: Report, format: string, name: string) {
  await audit(req, 'report.export', 'report', name, { format, rows: r.rows.length });
  const file = `${name}-${todayIST()}`;
  if (format === 'xlsx') {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${file}.xlsx"`);
    return res.send(await toXlsx(r));
  }
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${file}.csv"`);
    return res.send(toCsv(r));
  }
  res.json(r);
}

const filters = z.object({
  format: z.enum(['json', 'csv', 'xlsx']).default('json'), yearId: optId.optional(), sectionId: optId.optional(), from: optDate.optional(), to: optDate.optional(), examId: optId.optional(),
});

reportsRouter.get('/:type', ah(async (req, res) => {
  const f = filters.parse(Object.fromEntries(Object.entries(req.query).filter(([, v]) => v !== '')));
  const type = req.params.type;
  const y = await resolveYear(f.yearId);
  let r: Report;
  switch (type) {
    case 'students': {
      if (!can(req, 'students.view_all')) throw forbidden();
      r = { title: 'Students', columns: [
        { key: 'student_code', header: 'Student ID' }, { key: 'admission_no', header: 'Admission No' }, { key: 'name', header: 'Name' }, { key: 'class_name', header: 'Class' },
        { key: 'section_name', header: 'Section' }, { key: 'roll_no', header: 'Roll' }, { key: 'gender', header: 'Gender' }, { key: 'dob', header: 'DOB' },
        { key: 'board', header: 'Board' }, { key: 'medium', header: 'Medium' }, { key: 'residency', header: 'Residency' }, { key: 'transport', header: 'Transport' },
        { key: 'guardian', header: 'Guardian' }, { key: 'guardian_phone', header: 'Guardian Phone' }, { key: 'status', header: 'Status' }],
        rows: await q(`SELECT st.student_code, st.admission_no, st.first_name || coalesce(' ' || st.last_name,'') AS name, cl.name AS class_name, sec.name AS section_name, e.roll_no,
                              st.gender, st.dob, b.code AS board, m.code AS medium, e.residency, CASE WHEN e.transport_opted THEN 'Yes' ELSE 'No' END AS transport,
                              (SELECT g.name FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id WHERE sg.student_id = st.id ORDER BY sg.is_primary DESC LIMIT 1) AS guardian,
                              (SELECT g.phone FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id WHERE sg.student_id = st.id ORDER BY sg.is_primary DESC LIMIT 1) AS guardian_phone, e.status
                         FROM enrollments e JOIN students st ON st.id = e.student_id JOIN class_levels cl ON cl.id = e.class_level_id JOIN sections sec ON sec.id = e.section_id
                         LEFT JOIN boards b ON b.id = sec.board_id LEFT JOIN mediums m ON m.id = sec.medium_id
                        WHERE e.academic_year_id = $1 AND ($2::bigint IS NULL OR e.section_id = $2) ORDER BY cl.sort_order, sec.name, e.roll_no`, [y.id, f.sectionId ?? null]) };
      break;
    }
    case 'teachers': {
      if (!can(req, 'teachers.manage') && !can(req, 'reports.view')) throw forbidden();
      r = { title: 'Teachers', columns: [{ key: 'employee_code', header: 'Teacher ID' }, { key: 'name', header: 'Name' }, { key: 'phone', header: 'Phone' }, { key: 'email', header: 'Email' },
        { key: 'qualification', header: 'Qualification' }, { key: 'designation', header: 'Designation' }, { key: 'joining_date', header: 'Joined' }, { key: 'subjects', header: 'Subjects' }, { key: 'status', header: 'Status' }],
        rows: await q(`SELECT t.employee_code, t.first_name || coalesce(' ' || t.last_name,'') AS name, t.phone, t.email, t.qualification, t.designation, t.joining_date, t.status,
                              (SELECT string_agg(DISTINCT sub.name || ' (' || cl.name || '-' || s.name || ')', '; ') FROM teaching_assignments ta JOIN subjects sub ON sub.id = ta.subject_id
                                 JOIN sections s ON s.id = ta.section_id JOIN class_levels cl ON cl.id = s.class_level_id WHERE ta.teacher_id = t.id AND s.academic_year_id = $1) AS subjects
                         FROM teachers t ORDER BY t.first_name`, [y.id]) };
      break;
    }
    case 'attendance': {
      if (!f.sectionId) throw badRequest('Choose a section.');
      await assertSectionAccess(req, f.sectionId);
      r = { title: 'Attendance', columns: [{ key: 'roll_no', header: 'Roll' }, { key: 'name', header: 'Name' }, { key: 'total', header: 'Days marked' }, { key: 'present', header: 'Present' },
        { key: 'late', header: 'Late' }, { key: 'half_day', header: 'Half-day' }, { key: 'absent', header: 'Absent' }, { key: 'leave', header: 'Leave' }, { key: 'percent', header: 'Attendance %' }],
        rows: await q(`SELECT e.roll_no, st.first_name || coalesce(' ' || st.last_name,'') AS name, count(a.id) AS total, count(*) FILTER (WHERE a.status='present') AS present,
                              count(*) FILTER (WHERE a.status='late') AS late, count(*) FILTER (WHERE a.status='half_day') AS half_day, count(*) FILTER (WHERE a.status='absent') AS absent,
                              count(*) FILTER (WHERE a.status='leave') AS leave, ${PCT_SQL} AS percent
                         FROM enrollments e JOIN students st ON st.id = e.student_id
                         LEFT JOIN attendance_records a ON a.enrollment_id = e.id AND ($2::date IS NULL OR a.date >= $2) AND ($3::date IS NULL OR a.date <= $3)
                        WHERE e.section_id = $1 GROUP BY e.roll_no, st.first_name, st.last_name ORDER BY e.roll_no`, [f.sectionId, f.from ?? null, f.to ?? null]) };
      break;
    }
    case 'collections': {
      if (!can(req, 'fees.view')) throw forbidden();
      r = { title: 'Fee collections', columns: [{ key: 'paid_on', header: 'Date' }, { key: 'receipt_no', header: 'Receipt No' }, { key: 'student_code', header: 'Student ID' },
        { key: 'name', header: 'Student' }, { key: 'class_name', header: 'Class' }, { key: 'mode', header: 'Mode' }, { key: 'reference', header: 'Reference' },
        { key: 'amount_paise', header: 'Amount (₹)', money: true }, { key: 'status', header: 'Status' }, { key: 'received_by', header: 'Received by' }],
        rows: await q(`SELECT p.paid_on, r.receipt_no, st.student_code, st.first_name || coalesce(' ' || st.last_name,'') AS name, r.snapshot->'student'->>'className' AS class_name,
                              p.mode, p.reference, p.amount_paise, p.status, u.display_name AS received_by
                         FROM payments p JOIN students st ON st.id = p.student_id LEFT JOIN receipts r ON r.payment_id = p.id LEFT JOIN users u ON u.id = p.received_by
                        WHERE p.paid_on BETWEEN coalesce($1::date, CURRENT_DATE) AND coalesce($2::date, CURRENT_DATE) ORDER BY p.paid_on, p.id`, [f.from ?? null, f.to ?? null]) };
      break;
    }
    case 'outstanding': {
      if (!can(req, 'fees.view')) throw forbidden();
      r = { title: 'Outstanding fees', columns: [{ key: 'student_code', header: 'Student ID' }, { key: 'name', header: 'Student' }, { key: 'class_name', header: 'Class' },
        { key: 'section_name', header: 'Section' }, { key: 'roll_no', header: 'Roll' }, { key: 'guardian_phone', header: 'Guardian Phone' },
        { key: 'billed', header: 'Billed (₹)', money: true }, { key: 'paid', header: 'Paid (₹)', money: true }, { key: 'adjusted', header: 'Waived (₹)', money: true },
        { key: 'outstanding', header: 'Outstanding (₹)', money: true }, { key: 'overdue', header: 'Overdue (₹)', money: true }],
        rows: await q(`SELECT st.student_code, st.first_name || coalesce(' ' || st.last_name,'') AS name, cl.name AS class_name, sec.name AS section_name, e.roll_no,
                              (SELECT g.phone FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id WHERE sg.student_id = st.id ORDER BY sg.is_primary DESC LIMIT 1) AS guardian_phone,
                              sum(b.net_paise) AS billed, sum(b.paid_paise) AS paid, sum(b.adjusted_paise) AS adjusted, sum(b.outstanding_paise) AS outstanding,
                              coalesce(sum(b.outstanding_paise) FILTER (WHERE b.due_date < CURRENT_DATE),0) AS overdue
                         FROM fee_line_balances b JOIN enrollments e ON e.id = b.enrollment_id JOIN students st ON st.id = b.student_id
                         JOIN class_levels cl ON cl.id = e.class_level_id JOIN sections sec ON sec.id = e.section_id
                        WHERE b.academic_year_id = $1 AND ($2::bigint IS NULL OR e.section_id = $2)
                        GROUP BY st.id, cl.name, cl.sort_order, sec.name, e.roll_no HAVING sum(b.outstanding_paise) > 0 ORDER BY cl.sort_order, sec.name, e.roll_no`, [y.id, f.sectionId ?? null]) };
      break;
    }
    case 'hostel-occupancy': {
      if (!can(req, 'hostel.manage')) throw forbidden();
      r = { title: 'Hostel occupancy', columns: [{ key: 'hostel', header: 'Hostel' }, { key: 'room_no', header: 'Room' }, { key: 'bed_no', header: 'Bed' },
        { key: 'student', header: 'Student' }, { key: 'student_code', header: 'Student ID' }, { key: 'class_name', header: 'Class' }, { key: 'check_in', header: 'Check-in' }],
        rows: await q(`SELECT h.name AS hostel, r.room_no, b.bed_no, st.first_name || coalesce(' ' || st.last_name,'') AS student, st.student_code,
                              (SELECT cl.name || '-' || sec.name FROM enrollments e JOIN class_levels cl ON cl.id = e.class_level_id JOIN sections sec ON sec.id = e.section_id
                                WHERE e.student_id = st.id AND e.academic_year_id = $1) AS class_name, a.check_in
                         FROM hostel_beds b JOIN hostel_rooms r ON r.id = b.room_id JOIN hostels h ON h.id = r.hostel_id
                         LEFT JOIN hostel_allocations a ON a.bed_id = b.id AND a.check_out IS NULL LEFT JOIN students st ON st.id = a.student_id
                        WHERE b.is_active ORDER BY h.name, r.room_no, b.bed_no`, [y.id]) };
      break;
    }
    case 'exam-results': {
      if (!f.examId || !f.sectionId) throw badRequest('Choose an exam and section.');
      if (!can(req, 'exams.manage')) {
        const ct = await q('SELECT 1 FROM sections WHERE id=$1 AND class_teacher_id=$2', [f.sectionId, req.user!.teacherId ?? -1]);
        if (!ct.length) throw forbidden();
      }
      const data = await computeResults(f.examId, { sectionId: f.sectionId, onlyApproved: false });
      const subjects = data?.students[0]?.subjects.map((s: any) => s.subject) ?? [];
      r = { title: 'Exam results', columns: [{ key: 'roll_no', header: 'Roll' }, { key: 'name', header: 'Name' }, ...subjects.map((s: string, i: number) => ({ key: `s${i}`, header: s })),
        { key: 'total', header: 'Total' }, { key: 'max', header: 'Max' }, { key: 'percent', header: '%' }, { key: 'grade', header: 'Grade' }, { key: 'result', header: 'Result' }, { key: 'rank', header: 'Rank' }],
        rows: (data?.students ?? []).map((s: any) => ({ ...s, name: [s.first_name, s.last_name].filter(Boolean).join(' '),
          ...Object.fromEntries(s.subjects.map((x: any, i: number) => [`s${i}`, x.isAbsent ? 'AB' : x.obtained ?? ''])) })) };
      break;
    }
    default:
      throw badRequest('Unknown report.');
  }
  await send(res, req, r, f.format, type);
}));

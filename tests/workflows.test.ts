import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { Client, freshApp, ok } from './helpers.js';

let app: Express;
let admin: Client;
let pool: any;
const T: Record<string, any> = {}; // shared test state
const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const thisMonth = today.slice(0, 7);
const startYear = Number(today.slice(5, 7)) >= 4 ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
const nextMonth = (() => { const [y, m] = thisMonth.split('-').map(Number); const d = new Date(Date.UTC(y, m, 1)); return d.toISOString().slice(0, 7); })();

beforeAll(async () => {
  app = await freshApp();
  pool = (await import('../server/db/pool.js')).pool;
  const { hashPassword } = await import('../server/lib/passwords.js');
  await pool.query(`INSERT INTO users (username, password_hash, role, display_name, must_change_password) VALUES ('principal', $1, 'admin', 'Principal', false)`, [await hashPassword('Principal123')]);
  admin = await new Client(app).login('principal', 'Principal123');
});
afterAll(async () => { await pool?.end(); });

const lookup = async (c: Client) => ok(await c.get('/api/settings/lookups'));

describe('School setup', () => {
  it('configures academic year, sections, subjects, fees, transport, hostel', async () => {
    const y = ok(await admin.post('/api/settings/years', { name: `${startYear}-${String(startYear + 1).slice(2)}`, startDate: `${startYear}-04-01`, endDate: `${startYear + 1}-03-31` }), 201);
    expect(y.is_current).toBe(true);
    T.yearId = y.id;
    const lk = await lookup(admin);
    const cls = (code: string) => lk.classes.find((c: any) => c.code === code).id;
    T.cls = { NUR: cls('LKG'), // a preschool level (deactivated by default, but preschool rules stay supported)
       C5: cls('5'), C6: cls('6'), C10: cls('10') };
    const board = lk.boards.find((b: any) => b.code === 'CBSE').id;
    const medium = lk.mediums.find((m: any) => m.code === 'EN').id;
    const sec = async (classLevelId: number, name: string, yearId = T.yearId) =>
      ok(await admin.post('/api/academics/sections', { academicYearId: yearId, classLevelId, name, boardId: board, mediumId: medium, capacity: 40 }), 201).id;
    T.secNur = await sec(T.cls.NUR, 'A');
    T.sec5A = await sec(T.cls.C5, 'A');
    T.sec10A = await sec(T.cls.C10, 'A');
    const sub = async (code: string, name: string) => ok(await admin.post('/api/settings/subjects', { code, name }), 201).id;
    T.ENG = await sub('ENG', 'English'); T.MATH = await sub('MATH', 'Mathematics'); T.ACT = await sub('ACT', 'Activities');
    ok(await admin.put('/api/academics/class-subjects', { academicYearId: T.yearId, classLevelId: T.cls.C5, subjects: [{ subjectId: T.ENG }, { subjectId: T.MATH }] }));
    ok(await admin.put('/api/academics/class-subjects', { academicYearId: T.yearId, classLevelId: T.cls.NUR, subjects: [{ subjectId: T.ENG }, { subjectId: T.ACT }] }));
    ok(await admin.put('/api/academics/class-subjects', { academicYearId: T.yearId, classLevelId: T.cls.C10, subjects: [{ subjectId: T.MATH }] }));

    const cat = (code: string) => lk.categories.find((c: any) => c.code === code).id;
    T.cat = { ADMISSION: cat('ADMISSION'), TUITION: cat('TUITION'), PRESCHOOL: cat('PRESCHOOL'), UNIFORM: cat('UNIFORM'), BOOKS: cat('BOOKS'), HOSTEL: cat('HOSTEL'), TRANSPORT: cat('TRANSPORT') };
    T.route = ok(await admin.post('/api/fees/routes', { name: 'Route A', monthlyFee: '600' }), 201).id;
    // Transport cannot be put into a plan — it comes from the route.
    const bad = await admin.post('/api/fees/plans', { academicYearId: T.yearId, name: 'Bad', planType: 'preschool', items: [{ feeCategoryId: T.cat.TRANSPORT, amount: '100', frequency: 'monthly' }] });
    expect(bad.status).toBe(400);
    T.prePlan = ok(await admin.post('/api/fees/plans', { academicYearId: T.yearId, name: 'Preschool', planType: 'preschool', items: [
      { feeCategoryId: T.cat.ADMISSION, amount: '1000', frequency: 'one_time' }, { feeCategoryId: T.cat.PRESCHOOL, amount: '1200.50', frequency: 'monthly' },
      { feeCategoryId: T.cat.UNIFORM, amount: '800', frequency: 'one_time' }] }), 201).id;
    T.plan5 = ok(await admin.post('/api/fees/plans', { academicYearId: T.yearId, name: 'Class 5', planType: 'school', classLevelId: T.cls.C5, items: [
      { feeCategoryId: T.cat.TUITION, amount: '1500', frequency: 'monthly' }, { feeCategoryId: T.cat.BOOKS, amount: '2000', frequency: 'annual' }] }), 201).id;
    // Hostel package that also includes tuition (at a package rate) – must not double-charge tuition.
    T.hostelPlan = ok(await admin.post('/api/fees/plans', { academicYearId: T.yearId, name: 'Hostel package', planType: 'hostel', items: [
      { feeCategoryId: T.cat.HOSTEL, amount: '4000', frequency: 'monthly' }, { feeCategoryId: T.cat.TUITION, amount: '1400', frequency: 'monthly' }] }), 201).id;
    const h = ok(await admin.post('/api/hostel', { name: 'Boys Hostel', hostelType: 'boys' }), 201);
    T.room = ok(await admin.post(`/api/hostel/${h.id}/rooms`, { roomNo: '101', capacity: 1 }), 201).id;
    const rooms = ok(await admin.get(`/api/hostel/${h.id}/rooms`));
    T.bed = rooms[0].beds[0].id;
    expect(rooms[0].beds).toHaveLength(1);
  });
});

describe('Workflow 2: teacher setup', () => {
  it('creates a teacher with multiple subject assignments across sections', async () => {
    const r = ok(await admin.post('/api/teachers', { firstName: 'Anita', lastName: 'Sharma', phone: '9876543210', qualification: 'M.A.' }), 201);
    expect(r.username).toMatch(/^TCH\d{4}$/);
    T.teacherId = r.teacher.id; T.teacherUser = r.username;
    T.teacher = await new Client(app).firstLogin(r.username, r.temporaryPassword, 'Teacher123');
    ok(await admin.post('/api/academics/assignments', { teacherId: T.teacherId, items: [
      { sectionId: T.sec5A, subjectId: T.ENG }, { sectionId: T.sec5A, subjectId: T.MATH }, { sectionId: T.secNur, subjectId: T.ENG }] }), 201);
    ok(await admin.put(`/api/academics/sections/${T.sec5A}`, { name: 'A', classTeacherId: T.teacherId, capacity: 40 }));
    const prof = ok(await admin.get(`/api/teachers/${T.teacherId}`));
    expect(prof.assignments).toHaveLength(3);
    // A subject not mapped to the class cannot be assigned.
    const bad = await admin.post('/api/academics/assignments', { teacherId: T.teacherId, items: [{ sectionId: T.sec10A, subjectId: T.ENG }] });
    expect(bad.status).toBe(400);
    // A second teacher cannot silently take over an assigned subject.
    const t2 = ok(await admin.post('/api/teachers', { firstName: 'Rakesh' }), 201);
    T.teacher2Id = t2.teacher.id; T.teacher2 = await new Client(app).firstLogin(t2.username, t2.temporaryPassword, 'Teacher456');
    expect((await admin.post('/api/academics/assignments', { teacherId: t2.teacher.id, items: [{ sectionId: T.sec5A, subjectId: T.ENG }] })).status).toBe(400);
    ok(await admin.post('/api/academics/assignments', { teacherId: t2.teacher.id, items: [{ sectionId: T.sec10A, subjectId: T.MATH }] }), 201);
  });
});

const guardian = (name: string, phone: string) => [{ name, relation: 'Father', phone, isPrimary: true }];
async function admit(body: any) {
  return admin.post('/api/students', { dob: '2016-05-10', gender: 'male', guardians: guardian('Parent', '9000000000'), ...body });
}

describe('Workflow 1: admission', () => {
  it('admits students with unique IDs, roll numbers, fee plans and logins', async () => {
    const a = ok(await admit({ firstName: 'Aarav', lastName: 'Singh', enrollment: { sectionId: T.sec5A, residency: 'day_scholar', transportOpted: false }, feePlanIds: [T.plan5] }), 201);
    expect(a.student.student_code).toMatch(/^STU\d{8}$/);
    expect(a.enrollment.roll_no).toBe(1);
    T.A = a.student.id;
    T.studentA = await new Client(app).firstLogin(a.username, a.temporaryPassword, 'Student123');

    // Duplicate detection (same name + DOB) requires explicit confirmation.
    const dup = await admit({ firstName: 'Aarav', lastName: 'Singh', enrollment: { sectionId: T.sec5A, residency: 'day_scholar', transportOpted: false } });
    expect(dup.status).toBe(409);
    expect(dup.body.details.code).toBe('POSSIBLE_DUPLICATE');
    // Duplicate roll number within a section is rejected.
    const dupRoll = await admit({ firstName: 'Other', dob: '2016-01-01', enrollment: { sectionId: T.sec5A, rollNo: 1, residency: 'day_scholar', transportOpted: false } });
    expect(dupRoll.status).toBe(409);

    T.P1 = ok(await admit({ firstName: 'Pihu', dob: '2022-02-02', gender: 'female', enrollment: { sectionId: T.secNur, residency: 'day_scholar', transportOpted: false }, feePlanIds: [T.prePlan] }), 201).student.id;
    const p2 = ok(await admit({ firstName: 'Kiaan', dob: '2022-03-03', enrollment: { sectionId: T.secNur, residency: 'day_scholar', transportOpted: true, transportRouteId: T.route }, feePlanIds: [T.prePlan] }), 201);
    T.P2 = p2.student.id;
    expect(p2.enrollment.roll_no).toBe(2);
    // A school plan cannot be assigned to a preschool class.
    expect((await admit({ firstName: 'Wrong', dob: '2022-04-04', enrollment: { sectionId: T.secNur, residency: 'day_scholar', transportOpted: false }, feePlanIds: [T.plan5] })).status).toBe(400);
    const h = ok(await admit({ firstName: 'Harsh', dob: '2016-07-07', enrollment: { sectionId: T.sec5A, residency: 'hostel', transportOpted: false }, feePlanIds: [T.plan5, T.hostelPlan] }), 201);
    T.H = h.student.id;
    T.studentH = await new Client(app).firstLogin(h.username, h.temporaryPassword, 'Student456');
    T.H2 = ok(await admit({ firstName: 'Hemant', dob: '2016-08-08', enrollment: { sectionId: T.sec5A, residency: 'hostel', transportOpted: false }, feePlanIds: [T.plan5] }), 201).student.id;
    // Hostel plan only for hostel residents.
    expect((await admit({ firstName: 'Day', dob: '2016-09-09', enrollment: { sectionId: T.sec5A, residency: 'day_scholar', transportOpted: false }, feePlanIds: [T.plan5, T.hostelPlan] })).status).toBe(400);
  });
});

describe('Workflow 3: attendance', () => {
  it('teacher marks attendance for an assigned class and sees the report', async () => {
    const sections = ok(await T.teacher.get('/api/academics/sections'));
    expect(sections.map((s: any) => s.id).sort()).toEqual([T.secNur, T.sec5A].sort());
    const sheet = ok(await T.teacher.get(`/api/attendance/sheet?sectionId=${T.sec5A}&date=${today}`));
    expect(sheet.canEdit).toBe(true);
    const entries = sheet.students.map((s: any) => ({ studentId: s.student_id, status: s.student_id === T.H ? 'absent' : 'present' }));
    expect(ok(await T.teacher.post('/api/attendance/sheet', { sectionId: T.sec5A, date: today, entries })).created).toBe(entries.length);
    // Saving again does not create duplicates; a change is recorded as a correction.
    const again = ok(await T.teacher.post('/api/attendance/sheet', { sectionId: T.sec5A, date: today, entries: entries.map((e: any) => e.studentId === T.H ? { ...e, status: 'late' } : e) }));
    expect(again).toEqual({ created: 0, changed: 1 });
    const summary = ok(await T.teacher.get(`/api/attendance/summary?sectionId=${T.sec5A}`));
    expect(summary.find((s: any) => s.student_id === T.A).percent).toBe(100);
    // Unassigned section and future dates are rejected.
    expect((await T.teacher.get(`/api/attendance/sheet?sectionId=${T.sec10A}&date=${today}`)).status).toBe(403);
    expect((await T.teacher.post('/api/attendance/sheet', { sectionId: T.sec5A, date: '2099-01-01', entries })).status).toBe(403);
    const audit = ok(await admin.get('/api/settings/audit?action=attendance.correct'));
    expect(audit.length).toBeGreaterThan(0);
    // Student sees own attendance but cannot mark it.
    const mine = ok(await T.studentA.get(`/api/attendance/student/${T.A}`));
    expect(mine.overall.present).toBe(1);
    expect((await T.studentA.post('/api/attendance/sheet', { sectionId: T.sec5A, date: today, entries })).status).toBe(403);
  });
});

describe('Workflow 4: fee calculation', () => {
  it('applies preschool, transport and hostel rules without duplicates', async () => {
    const g = ok(await admin.post('/api/fees/invoices/generate', { fromMonth: thisMonth, toMonth: thisMonth }));
    expect(g.linesAdded).toBeGreaterThan(0);
    const lines = async (sid: number) => (ok(await admin.get(`/api/fees/students/${sid}/statement`)).invoices as any[]).flatMap((i) => i.lines);
    const p1 = await lines(T.P1);
    expect(p1.map((l) => l.fee_category_id).sort()).toEqual([T.cat.ADMISSION, T.cat.PRESCHOOL, T.cat.UNIFORM].sort());
    expect(p1.find((l) => l.fee_category_id === T.cat.PRESCHOOL).amount_paise).toBe(120050);
    const p2 = await lines(T.P2);
    expect(p2.filter((l) => l.fee_category_id === T.cat.TRANSPORT)).toHaveLength(1);
    expect(p2.find((l) => l.fee_category_id === T.cat.TRANSPORT).amount_paise).toBe(60000);
    const h = await lines(T.H);
    const tuition = h.filter((l) => l.fee_category_id === T.cat.TUITION);
    expect(tuition).toHaveLength(1);
    expect(tuition[0].amount_paise).toBe(140000); // hostel package rate replaces the base tuition
    expect(h.filter((l) => l.fee_category_id === T.cat.HOSTEL)).toHaveLength(1);
    expect(h.filter((l) => l.fee_category_id === T.cat.BOOKS)).toHaveLength(1);

    // Re-running generation is idempotent.
    expect(ok(await admin.post('/api/fees/invoices/generate', { fromMonth: thisMonth, toMonth: thisMonth })).linesAdded).toBe(0);
    // Next month: recurring charges only — no repeated uniform/admission/books.
    if (nextMonth <= `${startYear + 1}-03`) {
      ok(await admin.post('/api/fees/invoices/generate', { fromMonth: nextMonth, toMonth: nextMonth }));
      const p1b = await lines(T.P1);
      expect(p1b.filter((l) => l.fee_category_id === T.cat.UNIFORM)).toHaveLength(1);
      expect(p1b.filter((l) => l.fee_category_id === T.cat.ADMISSION)).toHaveLength(1);
      expect(p1b.filter((l) => l.fee_category_id === T.cat.PRESCHOOL)).toHaveLength(2);
      expect((await lines(T.A)).filter((l) => l.fee_category_id === T.cat.BOOKS)).toHaveLength(1);
    }
  });
});

describe('Workflows 5 & 6: payment, receipt and clearance', () => {
  it('records partial payments, issues receipts, and clears only at zero balance', async () => {
    const before = ok(await admin.get(`/api/fees/students/${T.P1}/statement`)).balance;
    expect(before.cleared).toBe(false);
    const key = 'test-key-p1-1';
    const pay = ok(await admin.post('/api/fees/payments', { studentId: T.P1, amount: '1000', mode: 'cash', idempotencyKey: key }), 201);
    expect(pay.receiptNo).toMatch(/^RCP\//);
    // Retry with the same key returns the same payment instead of charging twice.
    const retry = ok(await admin.post('/api/fees/payments', { studentId: T.P1, amount: '1000', mode: 'cash', idempotencyKey: key }));
    expect(retry.paymentId).toBe(pay.paymentId);
    const mid = ok(await admin.get(`/api/fees/students/${T.P1}/statement`)).balance;
    expect(mid.outstanding).toBe(before.outstanding - 100000);
    expect(mid.cleared).toBe(false);

    const receipt = ok(await admin.get(`/api/fees/receipts/${pay.receiptId}`));
    expect(receipt.snapshot.totals.balanceAfter).toBe(mid.outstanding);
    expect(receipt.snapshot.student.code).toMatch(/^STU/);
    const pdf = await admin.get(`/api/fees/receipts/${pay.receiptId}/pdf?lang=hi`).buffer(true);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    // Printing does not mark anything paid.
    expect(ok(await admin.get(`/api/fees/students/${T.P1}/statement`)).balance.outstanding).toBe(mid.outstanding);

    // UPI requires a reference; overpayment is rejected.
    expect((await admin.post('/api/fees/payments', { studentId: T.P1, amount: '10', mode: 'upi' })).status).toBe(400);
    expect((await admin.post('/api/fees/payments', { studentId: T.P1, amount: String(mid.outstanding / 100 + 1), mode: 'cash' })).status).toBe(400);

    // Concurrent payments for the same student are serialized and cannot exceed the balance.
    const half = Math.floor(mid.outstanding / 2) / 100;
    const results = await Promise.all([1, 2, 3].map((i) => admin.post('/api/fees/payments', { studentId: T.P1, amount: half.toFixed(2), mode: 'cash', idempotencyKey: `concurrent-${i}` })));
    if (results.filter((r) => r.status === 201).length !== 2) console.log(results.map((r) => [r.status, r.body]));
    expect(results.filter((r) => r.status === 201).length).toBe(2);
    const after = ok(await admin.get(`/api/fees/students/${T.P1}/statement`)).balance;
    expect(after.outstanding).toBeGreaterThanOrEqual(0);
    if (after.outstanding > 0) ok(await admin.post('/api/fees/payments', { studentId: T.P1, amount: (after.outstanding / 100).toFixed(2), mode: 'upi', reference: 'UPI123' }), 201);
    const final = ok(await admin.get(`/api/fees/students/${T.P1}/statement`)).balance;
    expect(final.outstanding).toBe(0);
    expect(final.cleared).toBe(true);

    // Reversal re-opens the balance and cancels the receipt (audited).
    ok(await admin.post(`/api/fees/payments/${pay.paymentId}/reverse`, { reason: 'Test reversal' }));
    const rev = ok(await admin.get(`/api/fees/students/${T.P1}/statement`)).balance;
    expect(rev.outstanding).toBe(100000);
    expect(rev.cleared).toBe(false);
    expect(ok(await admin.get(`/api/fees/receipts/${pay.receiptId}`)).status).toBe('cancelled');

    // Receipt search by student ID.
    const found = ok(await admin.get(`/api/fees/receipts?search=${receipt.snapshot.student.code}`));
    expect(found.length).toBeGreaterThan(0);
    T.receiptP1 = pay.receiptId;
  });
});

describe('Workflow 7: marks and results', () => {
  it('teacher enters marks, principal approves and publishes, student sees only own results', async () => {
    const exam = ok(await admin.post('/api/exams', { academicYearId: T.yearId, name: 'Half Yearly', examType: 'half_yearly', assessmentMode: 'marks', passPercent: 33 }), 201);
    T.exam = exam.id;
    ok(await admin.put(`/api/exams/${exam.id}/subjects`, { classLevelId: T.cls.C5, subjects: [{ subjectId: T.ENG, maxMarks: 100, passMarks: 33 }, { subjectId: T.MATH, maxMarks: 50, passMarks: 17 }] }));
    // Marks entry is closed until opened.
    const q = `examId=${exam.id}&sectionId=${T.sec5A}&subjectId=${T.ENG}`;
    expect(ok(await T.teacher.get(`/api/exams/marks/sheet?${q}`)).editable).toBe(false);
    ok(await admin.post(`/api/exams/${exam.id}/status`, { status: 'marks_entry' }));
    const sheet = ok(await T.teacher.get(`/api/exams/marks/sheet?${q}`));
    expect(sheet.editable).toBe(true);
    const ids = sheet.students.map((s: any) => s.student_id);
    expect((await T.teacher.put('/api/exams/marks/sheet', { examId: exam.id, sectionId: T.sec5A, subjectId: T.ENG, entries: [{ studentId: T.A, marks: 101 }] })).status).toBe(400);
    ok(await T.teacher.put('/api/exams/marks/sheet', { examId: exam.id, sectionId: T.sec5A, subjectId: T.ENG,
      entries: ids.map((id: number) => ({ studentId: id, marks: id === T.A ? 88.5 : 60, isAbsent: false })) }));
    // Teacher of another section cannot enter marks here.
    expect((await T.teacher2.put('/api/exams/marks/sheet', { examId: exam.id, sectionId: T.sec5A, subjectId: T.ENG, entries: [] })).status).toBe(403);
    // Teacher cannot publish.
    expect((await T.teacher.post(`/api/exams/${exam.id}/publish`)).status).toBe(403);
    ok(await T.teacher.post('/api/exams/marks/submit', { examId: exam.id, sectionId: T.sec5A, subjectId: T.ENG }));
    // Locked after submission.
    expect((await T.teacher.put('/api/exams/marks/sheet', { examId: exam.id, sectionId: T.sec5A, subjectId: T.ENG, entries: [{ studentId: T.A, marks: 99 }] })).status).toBe(403);
    // Not visible to the student before publication.
    expect(ok(await T.studentA.get('/api/me/results'))).toHaveLength(0);
    expect((await T.studentA.get(`/api/me/results/${exam.id}`)).status).toBe(403);

    const detail = ok(await admin.get(`/api/exams/${exam.id}`));
    const sub = detail.submissions.find((s: any) => s.section_id === T.sec5A && s.subject_name === 'English');
    expect(sub.status).toBe('submitted');
    ok(await admin.post(`/api/exams/submissions/${sub.submission_id}/review`, { action: 'approve' }));
    ok(await admin.post(`/api/exams/${exam.id}/publish`));

    const mine = ok(await T.studentA.get('/api/me/results'));
    expect(mine).toHaveLength(1);
    const eng = mine[0].result.subjects.find((s: any) => s.subject === 'English');
    expect(eng.obtained).toBe(88.5);
    // Maths marks were never approved → not shown.
    expect(mine[0].result.subjects.find((s: any) => s.subject === 'Mathematics').entered).toBe(false);
    // Student cannot see another student's report card.
    expect((await T.studentA.get(`/api/exams/${exam.id}/report-card/${T.H}`)).status).toBe(403);
    const pdf = await T.studentA.get(`/api/exams/${exam.id}/report-card/${T.A}/pdf`).buffer(true);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    // Withdrawal hides results again.
    ok(await admin.post(`/api/exams/${exam.id}/withdraw`, { reason: 'Recheck' }));
    expect(ok(await T.studentA.get('/api/me/results'))).toHaveLength(0);
    ok(await admin.post(`/api/exams/${exam.id}/reopen`));
  });
});

describe('Workflow 8: assignments and quizzes', () => {
  it('assignment for an assigned class is visible to its students only', async () => {
    const a = ok(await T.teacher.post('/api/learning/assignments', { sectionId: T.sec5A, subjectId: T.ENG, title: 'Essay on Monsoon', description: '200 words', dueDate: today }), 201);
    expect((await T.teacher.post('/api/learning/assignments', { sectionId: T.sec10A, subjectId: T.MATH, title: 'X' })).status).toBe(403);
    const list = ok(await T.studentA.get('/api/me/assignments'));
    expect(list.map((x: any) => x.id)).toContain(a.id);
    ok(await T.studentA.post(`/api/me/assignments/${a.id}/submit`, { text: 'My essay' }));
    const det = ok(await T.teacher.get(`/api/learning/assignments/${a.id}`));
    expect(det.students.find((s: any) => s.student_id === T.A).status).toBe('submitted');
    ok(await T.teacher.post(`/api/learning/assignments/${a.id}/review`, { studentId: T.A, status: 'completed', feedback: 'Good work' }));
    expect(ok(await T.studentA.get('/api/me/assignments')).find((x: any) => x.id === a.id).feedback).toBe('Good work');
  });
  it('quiz auto-grades objective questions and holds short answers for review', async () => {
    const qz = ok(await T.teacher.post('/api/learning/quizzes', { sectionId: T.sec5A, subjectId: T.MATH, title: 'Fractions', timeLimitMin: 10, questions: [
      { qtype: 'mcq', prompt: '1/2 + 1/2 = ?', options: ['1', '2', '1/4'], correctOption: 0, marks: 2 },
      { qtype: 'true_false', prompt: '1/3 > 1/2', correctBool: false, marks: 1 },
      { qtype: 'short_answer', prompt: 'Explain a fraction', answerKey: 'part of a whole', marks: 3 }] }), 201);
    ok(await T.teacher.post(`/api/learning/quizzes/${qz.id}/status`, { status: 'published' }));
    const { attemptId } = ok(await T.studentA.post(`/api/me/quizzes/${qz.id}/start`), 201);
    const att = ok(await T.studentA.get(`/api/me/attempts/${attemptId}`));
    expect(att.questions[0].correct_option).toBeNull(); // key hidden
    const [q1, q2, q3] = att.questions.map((x: any) => x.id);
    const sub = ok(await T.studentA.post(`/api/me/attempts/${attemptId}/submit`, { answers: [{ questionId: q1, value: 0 }, { questionId: q2, value: true }, { questionId: q3, value: 'A part of a whole' }] }));
    expect(sub.pendingReview).toBe(true);
    // Only one attempt allowed.
    expect((await T.studentA.post(`/api/me/quizzes/${qz.id}/start`)).status).toBe(400);
    ok(await T.teacher.post(`/api/learning/attempts/${attemptId}/grade`, { answers: [{ questionId: q3, awardedMarks: 3 }] }));
    const done = ok(await T.studentA.get(`/api/me/attempts/${attemptId}`));
    expect(done.status).toBe('graded');
    expect(done.score).toBe(5); // 2 (mcq) + 0 (wrong T/F) + 3 (reviewed)
  });
});

describe('Workflow 9: hostel', () => {
  it('allocates a bed and never exceeds room capacity', async () => {
    ok(await admin.post('/api/hostel/allocations', { studentId: T.H, bedId: T.bed }), 201);
    const second = await admin.post('/api/hostel/allocations', { studentId: T.H2, bedId: T.bed });
    expect(second.status).toBe(400);
    // Cannot reduce capacity below occupancy; increasing creates a bed, capacity is still enforced.
    ok(await admin.put(`/api/hostel/rooms/${T.room}`, { roomNo: '101', capacity: 2 }));
    const occ = ok(await admin.get('/api/hostel/reports/vacant'));
    expect(occ).toHaveLength(1);
    ok(await admin.post('/api/hostel/allocations', { studentId: T.H2, bedId: occ[0].bed_id }), 201);
    expect((await admin.put(`/api/hostel/rooms/${T.room}`, { roomNo: '101', capacity: 1 })).status).toBe(400);
    // Day scholars cannot be given a bed.
    expect((await admin.post('/api/hostel/allocations', { studentId: T.A, bedId: occ[0].bed_id })).status).toBe(400);
  });
});

describe('Workflow 10: security', () => {
  it('enforces roles and ownership on the server', async () => {
    expect((await T.teacher.get('/api/dashboard/admin')).status).toBe(403);
    expect((await T.teacher.get('/api/students')).status).toBe(403);
    expect((await T.teacher.post('/api/fees/payments', { studentId: T.A, amount: '1', mode: 'cash' })).status).toBe(403);
    expect((await T.teacher.get(`/api/fees/students/${T.A}/statement`)).status).toBe(403);
    expect((await T.teacher2.get(`/api/students/${T.A}`)).status).toBe(403); // not their section
    expect(ok(await T.teacher.get(`/api/students/${T.A}`)).fees).toBeNull(); // no finance without grant
    expect((await T.studentA.get('/api/dashboard/admin')).status).toBe(403);
    expect((await T.studentA.get(`/api/students/${T.H}`)).status).toBe(403);
    expect((await T.studentA.get(`/api/attendance/student/${T.H}`)).status).toBe(403);
    expect((await T.studentA.get(`/api/fees/students/${T.H}/statement`)).status).toBe(403);
    expect((await T.studentA.get(`/api/fees/receipts/${T.receiptP1}`)).status).toBe(403);
    expect((await T.studentA.get(`/api/fees/receipts/${T.receiptP1}/pdf`)).status).toBe(403);
    expect((await T.studentA.get('/api/settings/users')).status).toBe(403);
    expect((await T.studentA.post('/api/learning/assignments', {})).status).toBe(403);
    expect(ok(await T.studentA.get(`/api/students/${T.A}`)).id).toBe(T.A);
    // Teacher portal for students blocked.
    expect((await T.teacher.get('/api/me/profile')).status).toBe(403);
    // Unauthenticated access and missing CSRF token.
    const anon = await new Client(app).init();
    expect((await anon.get('/api/students')).status).toBe(401);
    expect((await T.studentA.agent.post('/api/me/corrections').send({ field: 'address', requestedValue: 'x' })).status).toBe(403);
    // Wrong password is generic; deactivated teacher is signed out immediately.
    expect((await new Client(app).init().then((c) => c.post('/api/auth/login', { identifier: T.teacherUser, password: 'nope' }))).status).toBe(401);
    ok(await admin.post(`/api/teachers/${T.teacher2Id}/status`, { status: 'inactive' }));
    expect((await T.teacher2.get('/api/dashboard/teacher')).status).toBe(401);
    ok(await admin.post(`/api/teachers/${T.teacher2Id}/status`, { status: 'active' }));
    // Granting fees.view to a teacher opens fee records for them.
    const u = ok(await admin.get('/api/settings/users?role=teacher')).users.find((x: any) => x.username === T.teacherUser);
    ok(await admin.put(`/api/settings/users/${u.id}/permissions`, { permissions: ['fees.view'] }));
    expect((await T.teacher.get(`/api/fees/students/${T.A}/statement`)).status).toBe(200);
  });
});

describe('Workflow 11: promotion preserves history', () => {
  it('promotes into the next year without losing marks, attendance or fees', async () => {
    const y2 = ok(await admin.post('/api/settings/years', { name: `${startYear + 1}-${String(startYear + 2).slice(2)}`, startDate: `${startYear + 1}-04-01`, endDate: `${startYear + 2}-03-31` }), 201);
    const sec6 = ok(await admin.post('/api/academics/sections', { academicYearId: y2.id, classLevelId: T.cls.C6, name: 'A' }), 201).id;
    const before = ok(await admin.get(`/api/students/${T.A}`));
    const oldEnr = before.enrollments.find((e: any) => e.academic_year_id === T.yearId);
    const statementBefore = ok(await admin.get(`/api/fees/students/${T.A}/statement`));
    ok(await admin.post('/api/students/promote', { toYearId: y2.id, items: [{ enrollmentId: oldEnr.id, action: 'promote', toSectionId: sec6 }] }));
    const after = ok(await admin.get(`/api/students/${T.A}`));
    expect(after.enrollments).toHaveLength(2);
    expect(after.enrollments.find((e: any) => e.id === oldEnr.id).status).toBe('promoted');
    const att = ok(await admin.get(`/api/attendance/student/${T.A}?yearId=${T.yearId}`));
    expect(att.records.length).toBeGreaterThan(0);
    const statementAfter = ok(await admin.get(`/api/fees/students/${T.A}/statement`));
    expect(statementAfter.invoices.length).toBe(statementBefore.invoices.length);
    const marks = await pool.query('SELECT count(*)::int AS n FROM marks WHERE student_id=$1', [T.A]);
    expect(marks.rows[0].n).toBe(1);
    // Promoting the same enrollment twice is rejected.
    expect((await admin.post('/api/students/promote', { toYearId: y2.id, items: [{ enrollmentId: oldEnr.id, action: 'promote', toSectionId: sec6 }] })).status).toBe(400);
  });
});

describe('Workflow 12: public website', () => {
  it('shows aggregate public information without authentication and no private data', async () => {
    const anon = await new Client(app).init();
    const site = ok(await anon.get('/api/public/site'));
    expect(site.stats.students).toBeGreaterThan(0);
    const json = JSON.stringify(site);
    expect(json).not.toContain('Aarav');
    expect(json).not.toContain('9000000000');
    expect(json).not.toContain('STU');
    ok(await anon.post('/api/public/enquiry', { studentName: 'New Child', classSought: 'LKG', parentName: 'Parent', phone: '9123456789' }), 201);
    expect((await anon.post('/api/public/enquiry', { studentName: 'Bot', classSought: 'LKG', parentName: 'Bot', phone: '9123456789', website: 'spam' })).status).toBe(400);
    expect((await anon.get(`/api/students/${T.A}`)).status).toBe(401);
    expect((await anon.get('/api/fees/receipts')).status).toBe(401);
    // Private uploads are not publicly readable.
    const f = await pool.query(`INSERT INTO files (id, original_name, mime_type, size_bytes, visibility, purpose, data) VALUES (gen_random_uuid(),'doc.pdf','application/pdf',4,'private','student_document','\\x25504446') RETURNING id`);
    expect((await anon.get(`/api/files/${f.rows[0].id}`)).status).toBe(401);
    expect((await T.studentA.get(`/api/files/${f.rows[0].id}`)).status).toBe(403);
  });
});

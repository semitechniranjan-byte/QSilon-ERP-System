import { one, pool, q, tx } from '../db/pool.js';
import { hashPassword, tempPassword } from '../lib/passwords.js';
import { nextCounter, pad } from '../lib/counters.js';
import { assignPlan } from '../services/fees.js';
import type { PoolClient } from 'pg';

/**
 * Creates clearly-marked demo data for evaluation. People are flagged is_demo; configuration rows are listed in
 * demo_records. Passwords are random and printed once — nothing is hardcoded.
 */
export async function seedDemo() {
  const exists = await one('SELECT 1 FROM students WHERE is_demo LIMIT 1');
  if (exists) { console.log('Demo data already present. Run "npm run demo:remove" first to recreate it.'); return; }
  const creds: string[] = [];
  await tx(async (c) => {
    const reg = (table: string, rid: number) => c.query('INSERT INTO demo_records (table_name, record_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [table, rid]);
    const s = await one('SELECT * FROM school_settings WHERE id=1', [], c);
    if (s.name === 'School Management System') {
      await c.query(`UPDATE school_settings SET name='Demo Public School', name_hi='डेमो पब्लिक स्कूल', tagline='Learning with values',
        address='Main Road', city='Patna', state='Bihar', pincode='800001', phone='+91 00000 00000', email='office@example.org', established_year=2005,
        about='This is demonstration content. Replace it from Settings > Website.', mission='Every child learns, grows and belongs.' WHERE id=1`);
    }
    // Academic year: reuse current or create one matching an April–March session.
    let year = await one('SELECT * FROM academic_years WHERE is_current', [], c);
    if (!year) {
      const now = new Date();
      const startY = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      year = await one(`INSERT INTO academic_years (name, start_date, end_date, is_current, status) VALUES ($1,$2,$3,true,'active') RETURNING *`,
        [`${startY}-${String(startY + 1).slice(2)}`, `${startY}-04-01`, `${startY + 1}-03-31`], c);
      await reg('academic_years', year.id);
    }
    const cl = async (code: string) => (await one('SELECT id FROM class_levels WHERE code=$1', [code], c)).id as number;
    const board = async (code: string) => (await one('SELECT id FROM boards WHERE code=$1', [code], c))?.id ?? null;
    const medium = async (code: string) => (await one('SELECT id FROM mediums WHERE code=$1', [code], c))?.id ?? null;

    const subjects: Record<string, number> = {};
    for (const [code, name, hi] of [['ENG', 'English', 'अंग्रेज़ी'], ['HIN', 'Hindi', 'हिन्दी'], ['MATH', 'Mathematics', 'गणित'], ['SCI', 'Science', 'विज्ञान'],
      ['SST', 'Social Science', 'सामाजिक विज्ञान'], ['EVS', 'Environmental Studies', 'पर्यावरण अध्ययन'], ['ACT', 'Activities', 'गतिविधियाँ']]) {
      let r = await one('SELECT id FROM subjects WHERE code=$1', [code], c);
      if (!r) { r = await one('INSERT INTO subjects (code, name, name_hi) VALUES ($1,$2,$3) RETURNING id', [code, name, hi], c); await reg('subjects', r.id); }
      subjects[code] = r.id;
    }

    // Teachers
    const teacherIds: number[] = [];
    for (const [fn, ln, qual] of [['Anita', 'Sharma (Demo)', 'M.A., B.Ed.'], ['Rakesh', 'Kumar (Demo)', 'M.Sc., B.Ed.'], ['Sunita', 'Devi (Demo)', 'NTT, B.A.']]) {
      const n = await nextCounter(c, 'teacher_code');
      const code = `${s.teacher_id_prefix}${pad(n, 4)}`;
      const pw = tempPassword();
      const u = await one(`INSERT INTO users (username, password_hash, role, display_name, is_demo) VALUES ($1,$2,'teacher',$3,true) RETURNING id`, [code, await hashPassword(pw), `${fn} ${ln}`], c);
      const t = await one(`INSERT INTO teachers (user_id, employee_code, first_name, last_name, qualification, joining_date, is_demo, phone) VALUES ($1,$2,$3,$4,$5,$6,true,'+91 00000 00001') RETURNING id`,
        [u.id, code, fn, ln, qual, year.start_date], c);
      teacherIds.push(t.id);
      creds.push(`teacher  ${code.padEnd(14)} ${pw}   (${fn} ${ln})`);
    }
    const [tAnita, tRakesh, tSunita] = teacherIds;

    // Sections
    const mk = async (code: string, name: string, b: string, m: string, ct: number) => {
      let r = await one('SELECT id FROM sections WHERE academic_year_id=$1 AND class_level_id=$2 AND name=$3', [year.id, await cl(code), name], c);
      if (!r) { r = await one(`INSERT INTO sections (academic_year_id, class_level_id, name, board_id, medium_id, class_teacher_id, capacity) VALUES ($1,$2,$3,$4,$5,$6,40) RETURNING id`,
        [year.id, await cl(code), name, await board(b), await medium(m), ct], c); await reg('sections', r.id); }
      return r.id as number;
    };
    const secNur = await mk('NUR', 'A', 'CBSE', 'EN', tSunita);
    const secUkg = await mk('UKG', 'A', 'CBSE', 'EN', tSunita);
    const sec5A = await mk('5', 'A', 'CBSE', 'EN', tAnita);
    const sec5B = await mk('5', 'B', 'BSEB', 'HI', tRakesh);
    const sec10 = await mk('10', 'A', 'CBSE', 'EN', tRakesh);

    const classSubjects: [string, string[]][] = [['NUR', ['ENG', 'HIN', 'ACT']], ['UKG', ['ENG', 'HIN', 'ACT']], ['5', ['ENG', 'HIN', 'MATH', 'EVS']], ['10', ['ENG', 'HIN', 'MATH', 'SCI', 'SST']]];
    for (const [code, subs] of classSubjects) {
      for (const sc of subs) {
        const r = await one(`INSERT INTO class_subjects (academic_year_id, class_level_id, subject_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id`, [year.id, await cl(code), subjects[sc]], c);
        if (r) await reg('class_subjects', r.id);
      }
    }
    const ta = async (sec: number, sub: string, t: number) => {
      const r = await one(`INSERT INTO teaching_assignments (section_id, subject_id, teacher_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id`, [sec, subjects[sub], t], c);
      if (r) await reg('teaching_assignments', r.id);
    };
    for (const sec of [secNur, secUkg]) for (const sub of ['ENG', 'HIN', 'ACT']) await ta(sec, sub, tSunita);
    for (const sec of [sec5A, sec5B]) { await ta(sec, 'ENG', tAnita); await ta(sec, 'HIN', tAnita); await ta(sec, 'MATH', tRakesh); await ta(sec, 'EVS', tRakesh); }
    await ta(sec10, 'ENG', tAnita); await ta(sec10, 'HIN', tAnita); await ta(sec10, 'MATH', tRakesh); await ta(sec10, 'SCI', tRakesh); await ta(sec10, 'SST', tAnita);

    // Fee configuration (demo amounts, clearly labelled)
    const cat = async (code: string) => (await one('SELECT id FROM fee_categories WHERE code=$1', [code], c)).id as number;
    const plan = async (name: string, type: string, classCode: string | null, items: [string, number, string][]) => {
      const p = await one(`INSERT INTO fee_plans (academic_year_id, name, plan_type, class_level_id, description) VALUES ($1,$2,$3,$4,'Demo plan – replace with real fees') RETURNING id`,
        [year.id, `[DEMO] ${name}`, type, classCode ? await cl(classCode) : null], c);
      await reg('fee_plans', p.id);
      for (const [code, rupees, freq] of items) {
        await c.query('INSERT INTO fee_plan_items (fee_plan_id, fee_category_id, amount_paise, frequency) VALUES ($1,$2,$3,$4)', [p.id, await cat(code), rupees * 100, freq]);
      }
      return p.id as number;
    };
    const prePlan = await plan('Preschool', 'preschool', null, [['ADMISSION', 2000, 'one_time'], ['PRESCHOOL', 1200, 'monthly'], ['UNIFORM', 1500, 'one_time'], ['BOOKS', 1000, 'annual']]);
    const p5 = await plan('Class 5', 'school', '5', [['ADMISSION', 3000, 'one_time'], ['TUITION', 1500, 'monthly'], ['ANNUAL', 2500, 'annual'], ['EXAM', 500, 'half_yearly'], ['UNIFORM', 1800, 'one_time'], ['BOOKS', 2200, 'annual']]);
    const p10 = await plan('Class 10', 'school', '10', [['ADMISSION', 3000, 'one_time'], ['TUITION', 2200, 'monthly'], ['ANNUAL', 3000, 'annual'], ['EXAM', 800, 'half_yearly'], ['BOOKS', 3500, 'annual']]);
    const pHostel = await plan('Hostel', 'hostel', null, [['HOSTEL', 4000, 'monthly'], ['MESS', 3000, 'monthly']]);
    const route = await one(`INSERT INTO transport_routes (name, description, stops, monthly_fee_paise) VALUES ('[DEMO] Route 1','Demo route','Station Road, Gandhi Maidan, Boring Road',80000) RETURNING id`, [], c);
    await reg('transport_routes', route.id);

    // Hostel
    const h = await one(`INSERT INTO hostels (name, hostel_type, warden_name, emergency_phone) VALUES ('[DEMO] Boys Hostel','boys','Demo Warden','+91 00000 00002') RETURNING id`, [], c);
    await reg('hostels', h.id);
    for (const [no, cap] of [['101', 2], ['102', 3]] as [string, number][]) {
      const r = await one('INSERT INTO hostel_rooms (hostel_id, room_no, floor, capacity) VALUES ($1,$2,$3,$4) RETURNING id', [h.id, no, '1', cap], c);
      await reg('hostel_rooms', r.id);
      for (let i = 1; i <= cap; i++) { const b = await one('INSERT INTO hostel_beds (room_id, bed_no) VALUES ($1,$2) RETURNING id', [r.id, `B${i}`], c); await reg('hostel_beds', b.id); }
    }

    // Students
    const first = ['Aarav', 'Diya', 'Vivaan', 'Ananya', 'Arjun', 'Isha', 'Kabir', 'Meera', 'Rohan', 'Saanvi', 'Aditya', 'Priya'];
    const lastN = ['Singh', 'Kumari', 'Prasad', 'Verma', 'Yadav', 'Gupta'];
    const plans: Record<number, number> = { [secNur]: prePlan, [secUkg]: prePlan, [sec5A]: p5, [sec5B]: p5, [sec10]: p10 };
    const yearStart = year.start_date.slice(0, 4);
    let k = 0;
    for (const [sec, count, age] of [[secNur, 3, 3], [secUkg, 3, 5], [sec5A, 4, 10], [sec5B, 3, 10], [sec10, 4, 15]] as [number, number, number][]) {
      for (let i = 1; i <= count; i++, k++) {
        const fn = first[k % first.length];
        const ln = `${lastN[k % lastN.length]} (Demo)`;
        const sn = await nextCounter(c, `student_code:${yearStart}`);
        const code = `${s.student_id_prefix}${yearStart}${pad(sn, 4)}`;
        const an = await nextCounter(c, 'admission_no');
        const pw = tempPassword();
        const u = await one(`INSERT INTO users (username, password_hash, role, display_name, is_demo) VALUES ($1,$2,'student',$3,true) RETURNING id`, [code, await hashPassword(pw), `${fn} ${ln}`], c);
        const dob = `${Number(yearStart) - age}-0${(k % 9) + 1}-1${k % 9}`;
        const st = await one(`INSERT INTO students (user_id, student_code, admission_no, first_name, last_name, dob, gender, address, admission_date, is_demo)
                              VALUES ($1,$2,$3,$4,$5,$6,$7,'Demo address',$8,true) RETURNING id`,
          [u.id, code, `${s.admission_prefix}${pad(an, 5)}`, fn, ln, dob, k % 2 ? 'female' : 'male', year.start_date], c);
        const g = await one(`INSERT INTO guardians (name, phone, is_demo) VALUES ($1,$2,true) RETURNING id`, [`Parent of ${fn} (Demo)`, `+91 00000 1${pad(k, 4)}`], c);
        await c.query(`INSERT INTO student_guardians (student_id, guardian_id, relation, is_primary) VALUES ($1,$2,'Father',true)`, [st.id, g.id]);
        const hostel = sec === sec10 && i <= 2;
        const transport = !hostel && i % 2 === 0;
        const secRow = await one('SELECT class_level_id FROM sections WHERE id=$1', [sec], c);
        const e = await one(`INSERT INTO enrollments (student_id, academic_year_id, section_id, class_level_id, roll_no, residency, transport_opted, transport_route_id, enrolled_on)
                             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [st.id, year.id, sec, secRow.class_level_id, i, hostel ? 'hostel' : 'day_scholar', transport, transport ? route.id : null, year.start_date], c);
        await assignPlan(c as PoolClient, e.id, plans[sec], null);
        if (hostel) await assignPlan(c as PoolClient, e.id, pHostel, null);
        if (k < 4) creds.push(`student  ${code.padEnd(14)} ${pw}   (${fn} ${ln})`);
      }
    }
    await c.query(`INSERT INTO notices (title, body, audience) VALUES ('[DEMO] Welcome to the new session', 'This is a demo notice. Remove demo data before going live.', 'public')`);
  });
  console.log('\nDemo data created. Temporary passwords (shown once; users must change them at first login):\n');
  for (const l of creds) console.log('  ' + l);
  console.log('\nOther demo students have random passwords — reset them from the admin portal if needed.');
}

/** Delete all demo-flagged records and their dependent rows. Real records are never touched. */
export async function removeDemo() {
  await tx(async (c) => {
    const ds = `(SELECT id FROM students WHERE is_demo)`;
    const dt = `(SELECT id FROM teachers WHERE is_demo)`;
    const steps = [
      `DELETE FROM quiz_answers WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE student_id IN ${ds} OR quiz_id IN (SELECT id FROM quizzes WHERE teacher_id IN ${dt}))`,
      `DELETE FROM quiz_attempts WHERE student_id IN ${ds} OR quiz_id IN (SELECT id FROM quizzes WHERE teacher_id IN ${dt})`,
      `DELETE FROM quiz_questions WHERE quiz_id IN (SELECT id FROM quizzes WHERE teacher_id IN ${dt})`,
      `DELETE FROM quizzes WHERE teacher_id IN ${dt}`,
      `DELETE FROM assignment_submissions WHERE student_id IN ${ds} OR assignment_id IN (SELECT id FROM assignments WHERE teacher_id IN ${dt})`,
      `DELETE FROM assignments WHERE teacher_id IN ${dt}`,
      `DELETE FROM study_materials WHERE teacher_id IN ${dt}`,
      `DELETE FROM report_card_remarks WHERE student_id IN ${ds}`,
      `DELETE FROM development_assessments WHERE student_id IN ${ds}`,
      `DELETE FROM marks WHERE student_id IN ${ds}`,
      `DELETE FROM refund_allocations WHERE refund_id IN (SELECT r.id FROM refunds r JOIN payments p ON p.id = r.payment_id WHERE p.student_id IN ${ds})`,
      `DELETE FROM refunds WHERE payment_id IN (SELECT id FROM payments WHERE student_id IN ${ds})`,
      `DELETE FROM receipts WHERE payment_id IN (SELECT id FROM payments WHERE student_id IN ${ds})`,
      `DELETE FROM payment_allocations WHERE payment_id IN (SELECT id FROM payments WHERE student_id IN ${ds})`,
      `DELETE FROM payments WHERE student_id IN ${ds}`,
      `DELETE FROM fee_adjustments WHERE invoice_line_id IN (SELECT l.id FROM fee_invoice_lines l JOIN fee_invoices i ON i.id = l.invoice_id WHERE i.student_id IN ${ds})`,
      `DELETE FROM fee_invoice_lines WHERE invoice_id IN (SELECT id FROM fee_invoices WHERE student_id IN ${ds})`,
      `DELETE FROM fee_invoices WHERE student_id IN ${ds}`,
      `DELETE FROM concessions WHERE enrollment_id IN (SELECT id FROM enrollments WHERE student_id IN ${ds})`,
      `DELETE FROM student_fee_plans WHERE enrollment_id IN (SELECT id FROM enrollments WHERE student_id IN ${ds})`,
      `DELETE FROM attendance_records WHERE student_id IN ${ds}`,
      `DELETE FROM hostel_allocations WHERE student_id IN ${ds}`,
      `DELETE FROM profile_correction_requests WHERE student_id IN ${ds}`,
      `DELETE FROM student_documents WHERE student_id IN ${ds}`,
      `DELETE FROM enrollments WHERE student_id IN ${ds}`,
      `DELETE FROM student_guardians WHERE student_id IN ${ds}`,
      `DELETE FROM students WHERE is_demo`,
      `DELETE FROM guardians WHERE is_demo AND id NOT IN (SELECT guardian_id FROM student_guardians)`,
      `DELETE FROM teacher_attendance WHERE teacher_id IN ${dt}`,
      `DELETE FROM timetable_entries WHERE teacher_id IN ${dt}`,
      `DELETE FROM teaching_assignments WHERE teacher_id IN ${dt}`,
      `UPDATE sections SET class_teacher_id = NULL WHERE class_teacher_id IN ${dt}`,
      `DELETE FROM teachers WHERE is_demo`,
      `DELETE FROM notices WHERE title LIKE '[DEMO]%'`,
    ];
    for (const sql of steps) await c.query(sql);
    // Configuration rows created by the seed, if no longer referenced by real data.
    for (const table of ['hostel_beds', 'hostel_rooms', 'hostels', 'transport_routes', 'fee_plans', 'teaching_assignments', 'class_subjects', 'sections', 'subjects', 'academic_years']) {
      const ids = (await q('SELECT record_id FROM demo_records WHERE table_name=$1', [table], c)).map((r) => r.record_id);
      for (const rid of ids) {
        await c.query('SAVEPOINT d');
        try {
          if (table === 'fee_plans') await c.query('DELETE FROM fee_plan_items WHERE fee_plan_id=$1', [rid]);
          await c.query(`DELETE FROM ${table} WHERE id=$1`, [rid]);
          await c.query('DELETE FROM demo_records WHERE table_name=$1 AND record_id=$2', [table, rid]);
          await c.query('RELEASE SAVEPOINT d');
        } catch {
          await c.query('ROLLBACK TO SAVEPOINT d'); // still used by real records — keep it
        }
      }
    }
    await c.query(`DELETE FROM "session" WHERE (sess->>'userId')::bigint IN (SELECT id FROM users WHERE is_demo)`);
    await c.query(`DELETE FROM user_permissions WHERE user_id IN (SELECT id FROM users WHERE is_demo)`);
    // Detach any remaining references to demo users (e.g. attendance they marked for real students).
    const refs = await q(`SELECT tc.table_name, kcu.column_name FROM information_schema.table_constraints tc
                            JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
                            JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
                           WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'users' AND tc.table_schema = current_schema()`, [], c);
    for (const r of refs) {
      if (['students', 'teachers', 'user_permissions'].includes(r.table_name)) continue;
      await c.query('SAVEPOINT u');
      try {
        await c.query(`UPDATE ${r.table_name} SET ${r.column_name} = NULL WHERE ${r.column_name} IN (SELECT id FROM users WHERE is_demo)`);
        await c.query('RELEASE SAVEPOINT u');
      } catch { await c.query('ROLLBACK TO SAVEPOINT u'); }
    }
    await c.query(`DELETE FROM users WHERE is_demo`);
  });
  console.log('Demo data removed.');
  void pool;
}

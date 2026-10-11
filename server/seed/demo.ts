import type { PoolClient } from 'pg';
import { one, pool, q, tx } from '../db/pool.js';
import { assertAdminSetPassword, hashPassword, tempPassword } from '../lib/passwords.js';
import { nextCounter, pad } from '../lib/counters.js';
import { addMonths, todayIST } from '../lib/dates.js';
import { assignPlan, generateForEnrollment, recordPayment } from '../services/fees.js';

/**
 * Sample data for demonstrations. Every person created is flagged `is_demo`, and every configuration row
 * (sections, plans, exams, notices…) is listed in `demo_records`, so `removeDemo()` deletes exactly this data
 * and nothing else. Passwords are chosen by the administrator (or random when run from the CLI).
 */

// Small deterministic random generator so demo data looks the same every time.
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260411);
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

const BOYS = ['Aarav', 'Vivaan', 'Aditya', 'Arjun', 'Reyansh', 'Krishna', 'Ishaan', 'Kabir', 'Rohan', 'Ayaan', 'Shaurya', 'Atharv', 'Dhruv', 'Harsh', 'Yash', 'Pranav', 'Aryan', 'Ritik', 'Anshu', 'Sahil'];
const GIRLS = ['Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Pari', 'Isha', 'Meera', 'Riya', 'Kavya', 'Anvi', 'Myra', 'Navya', 'Khushi', 'Priya', 'Sneha', 'Tanvi', 'Shreya', 'Nidhi', 'Pooja', 'Simran'];
const SURNAMES = ['Kumar', 'Singh', 'Sharma', 'Prasad', 'Verma', 'Gupta', 'Yadav', 'Jha', 'Mishra', 'Sinha', 'Pandey', 'Choudhary', 'Raj', 'Thakur', 'Srivastava'];
const FATHERS = ['Rajesh', 'Suresh', 'Manoj', 'Sanjay', 'Anil', 'Vinod', 'Ramesh', 'Ajay', 'Pankaj', 'Ravi', 'Dinesh', 'Amit', 'Rakesh', 'Sunil', 'Mukesh'];
const ROADS = ['Boring Road', 'Kankarbagh', 'Rajendra Nagar', 'Bailey Road', 'Patliputra Colony', 'Anisabad', 'Danapur', 'Ashok Rajpath'];

export interface DemoResult { teachers: { name: string; username: string }[]; students: { name: string; username: string; className: string }[]; password: string | null; summary: Record<string, number> }

export async function demoStatus() {
  const r = await one(`SELECT (SELECT count(*) FROM students WHERE is_demo) AS students, (SELECT count(*) FROM teachers WHERE is_demo) AS teachers`);
  return { loaded: r.students > 0 || r.teachers > 0, ...r };
}

export async function seedDemo(opts: { password?: string | null; actorUserId?: number | null; log?: (m: string) => void } = {}): Promise<DemoResult> {
  const log = opts.log ?? console.log;
  if ((await demoStatus()).loaded) throw new Error('Sample data is already loaded. Remove it first to load it again.');
  if (opts.password) assertAdminSetPassword(opts.password);
  const sharedHash = opts.password ? await hashPassword(opts.password) : null;
  const credFor = async () => (sharedHash ? { hash: sharedHash, pw: opts.password!, mustChange: false } : (() => { const pw = tempPassword(); return hashPassword(pw).then((hash) => ({ hash, pw, mustChange: true })); })());
  const actor = opts.actorUserId ?? (await one(`SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`))?.id ?? null;
  const today = todayIST();
  const result: DemoResult = { teachers: [], students: [], password: opts.password ?? null, summary: {} };
  const enrollmentsToBill: number[] = [];
  const studentsByClass: Record<string, { studentId: number; enrollmentId: number; sectionId: number; userId: number }[]> = {};
  let yearRow: any;
  const sectionIds: Record<string, number> = {};
  const teacherIds: Record<string, number> = {};
  const teacherUserIds: Record<number, number> = {};

  await tx(async (c) => {
    const reg = (table: string, rid: number) => c.query('INSERT INTO demo_records (table_name, record_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [table, rid]);
    const s = await one('SELECT * FROM school_settings WHERE id=1', [], c);
    await c.query(`UPDATE school_settings SET address = coalesce(address, 'Main Road'), city = coalesce(city, 'Patna'), state = coalesce(state, 'Bihar'),
      pincode = coalesce(pincode, '800001'), phone = coalesce(phone, '+91 90000 00000'), email = coalesce(email, 'info@futurecreations.school'),
      established_year = coalesce(established_year, 2008), principal_name = coalesce(principal_name, 'Principal') WHERE id = 1`);

    // ---- Academic year
    yearRow = await one('SELECT * FROM academic_years WHERE is_current', [], c);
    if (!yearRow) {
      const now = new Date();
      const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      yearRow = await one(`INSERT INTO academic_years (name, start_date, end_date, is_current, status) VALUES ($1,$2,$3,true,'active') RETURNING *`,
        [`${y}-${String(y + 1).slice(2)}`, `${y}-04-01`, `${y + 1}-03-31`], c);
    }
    const Y = yearRow.id;
    const termCount = await one('SELECT count(*) AS n FROM terms WHERE academic_year_id = $1', [Y], c);
    if (!termCount.n) {
      const y0 = Number(yearRow.start_date.slice(0, 4));
      for (const [n, a, b] of [['Term 1', `${y0}-04-01`, `${y0}-09-30`], ['Term 2', `${y0}-10-01`, `${y0 + 1}-03-31`]]) {
        const t = await one('INSERT INTO terms (academic_year_id, name, start_date, end_date) VALUES ($1,$2,$3,$4) RETURNING id', [Y, n, a, b], c);
      }
    }
    const cl = async (code: string) => (await one('SELECT id FROM class_levels WHERE code=$1', [code], c)).id as number;
    const boardId = async (code: string) => (await one('SELECT id FROM boards WHERE code=$1', [code], c))?.id ?? null;
    const mediumId = async (code: string) => (await one('SELECT id FROM mediums WHERE code=$1', [code], c))?.id ?? null;

    // ---- Subjects
    const subjects: Record<string, number> = {};
    for (const [code, name, hi] of [['ENG', 'English', 'अंग्रेज़ी'], ['HIN', 'Hindi', 'हिन्दी'], ['MATH', 'Mathematics', 'गणित'], ['SCI', 'Science', 'विज्ञान'],
      ['SST', 'Social Science', 'सामाजिक विज्ञान'], ['EVS', 'Environmental Studies', 'पर्यावरण अध्ययन'], ['COMP', 'Computer', 'कंप्यूटर'],
      ['PHY', 'Physics', 'भौतिकी'], ['CHEM', 'Chemistry', 'रसायन'], ['BIO', 'Biology', 'जीव विज्ञान'], ['ACT', 'Activities', 'गतिविधियाँ']]) {
      let r = await one('SELECT id FROM subjects WHERE code=$1', [code], c);
      if (!r) { r = await one('INSERT INTO subjects (code, name, name_hi) VALUES ($1,$2,$3) RETURNING id', [code, name, hi], c); }
      subjects[code] = r.id;
    }

    // ---- Teachers
    const TEACHERS: [string, string, string, string, string][] = [
      ['anita', 'Anita', 'Sharma', 'M.A. (English), B.Ed.', 'TGT English'],
      ['rakesh', 'Rakesh', 'Kumar', 'M.Sc. (Mathematics), B.Ed.', 'PGT Mathematics'],
      ['sunita', 'Sunita', 'Devi', 'M.Sc. (Chemistry), B.Ed.', 'PGT Chemistry & Biology'],
      ['pooja', 'Pooja', 'Mishra', 'B.El.Ed.', 'PRT'],
      ['vikash', 'Vikash', 'Singh', 'M.Sc. (Physics), B.Ed.', 'PGT Science'],
      ['neha', 'Neha', 'Gupta', 'M.A. (Hindi), B.Ed.', 'TGT Hindi'],
      ['amit', 'Amit', 'Jha', 'M.A. (History), B.Ed.', 'TGT Social Science'],
      ['ritu', 'Ritu', 'Sinha', 'B.Sc., B.Ed.', 'PRT'],
      ['deepak', 'Deepak', 'Verma', 'MCA', 'Computer Teacher'],
    ];
    for (const [key, fn, ln, qual, desig] of TEACHERS) {
      const n = await nextCounter(c, 'teacher_code');
      const code = `${s.teacher_id_prefix}${pad(n, 4)}`;
      const cr = await credFor();
      const u = await one(`INSERT INTO users (username, password_hash, role, display_name, is_demo, must_change_password) VALUES ($1,$2,'teacher',$3,true,$4) RETURNING id`,
        [code, cr.hash, `${fn} ${ln}`, cr.mustChange], c);
      const t = await one(`INSERT INTO teachers (user_id, employee_code, first_name, last_name, gender, qualification, designation, experience_years, joining_date, phone, email, is_demo)
                           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true) RETURNING id`,
        [u.id, code, fn, ln, ['anita', 'sunita', 'pooja', 'neha', 'ritu'].includes(key) ? 'female' : 'male', qual, desig, between(3, 18),
          `${2010 + between(0, 12)}-0${between(1, 9)}-15`, `+91 90000 1${pad(n, 4)}`, `${key}@futurecreations.school`], c);
      teacherIds[key] = t.id;
      teacherUserIds[t.id] = u.id;
      result.teachers.push({ name: `${fn} ${ln}`, username: code + (cr.mustChange ? `  (temporary password: ${cr.pw})` : '') });
    }

    // ---- Sections
    const SECTIONS: [string, string, string, string, string, string][] = [
      // key, class code, section, board, medium, class teacher
      ['NURA', 'NUR', 'A', 'CBSE', 'EN', 'pooja'], ['1A', '1', 'A', 'CBSE', 'EN', 'pooja'], ['2A', '2', 'A', 'CBSE', 'EN', 'pooja'], ['3A', '3', 'A', 'CBSE', 'EN', 'ritu'], ['4A', '4', 'A', 'CBSE', 'EN', 'ritu'],
      ['5A', '5', 'A', 'CBSE', 'EN', 'anita'], ['6A', '6', 'A', 'CBSE', 'EN', 'neha'], ['7A', '7', 'A', 'BSEB', 'HI', 'amit'], ['8A', '8', 'A', 'CBSE', 'EN', 'deepak'],
      ['9A', '9', 'A', 'CBSE', 'EN', 'sunita'], ['10A', '10', 'A', 'CBSE', 'EN', 'rakesh'], ['11A', '11', 'A', 'CBSE', 'EN', 'vikash'], ['12A', '12', 'A', 'CBSE', 'EN', 'anita'],
    ];
    for (const [key, code, name, b, m, ct] of SECTIONS) {
      let r = await one('SELECT id FROM sections WHERE academic_year_id=$1 AND class_level_id=$2 AND name=$3', [Y, await cl(code), name], c);
      if (!r) {
        r = await one(`INSERT INTO sections (academic_year_id, class_level_id, name, board_id, medium_id, class_teacher_id, capacity, room) VALUES ($1,$2,$3,$4,$5,$6,40,$7) RETURNING id`,
          [Y, await cl(code), name, await boardId(b), await mediumId(m), teacherIds[ct], `Room ${100 + Object.keys(sectionIds).length + 1}`], c);
      }
      sectionIds[key] = r.id;
    }
    const CLASS_SUBJECTS: Record<string, string[]> = {
      NUR: ['ENG', 'HIN', 'MATH'], '1': ['ENG', 'HIN', 'MATH', 'EVS'], '2': ['ENG', 'HIN', 'MATH', 'EVS'], '3': ['ENG', 'HIN', 'MATH', 'EVS', 'COMP'], '4': ['ENG', 'HIN', 'MATH', 'EVS', 'COMP'],
      '5': ['ENG', 'HIN', 'MATH', 'EVS', 'COMP'], '6': ['ENG', 'HIN', 'MATH', 'SCI', 'SST', 'COMP'], '7': ['ENG', 'HIN', 'MATH', 'SCI', 'SST', 'COMP'],
      '8': ['ENG', 'HIN', 'MATH', 'SCI', 'SST', 'COMP'], '9': ['ENG', 'HIN', 'MATH', 'SCI', 'SST'], '10': ['ENG', 'HIN', 'MATH', 'SCI', 'SST'],
      '11': ['ENG', 'PHY', 'CHEM', 'MATH', 'BIO'], '12': ['ENG', 'PHY', 'CHEM', 'MATH', 'BIO'],
    };
    for (const [code, subs] of Object.entries(CLASS_SUBJECTS)) {
      for (const sc of subs) {
        await one(`INSERT INTO class_subjects (academic_year_id, class_level_id, subject_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id`, [Y, await cl(code), subjects[sc]], c);
      }
    }
    const WHO: Record<string, string> = { ENG: 'anita', HIN: 'neha', MATH: 'rakesh', SCI: 'vikash', PHY: 'vikash', CHEM: 'sunita', BIO: 'sunita', SST: 'amit', EVS: 'ritu', COMP: 'deepak', ACT: 'ritu' };
    const assignments: { sectionKey: string; subject: string; teacher: number }[] = [];
    for (const [key, code] of SECTIONS.map((x) => [x[0], x[1]])) {
      for (const sc of CLASS_SUBJECTS[code]) {
        let tk = WHO[sc];
        // Primary classes: the class teacher takes English, Maths and EVS.
        if (['NUR', '1', '2', '3', '4'].includes(code) && ['ENG', 'MATH', 'EVS'].includes(sc)) tk = SECTIONS.find((x) => x[0] === key)![5];
        const r = await one(`INSERT INTO teaching_assignments (section_id, subject_id, teacher_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id`, [sectionIds[key], subjects[sc], teacherIds[tk]], c);
        if (r) await reg('teaching_assignments', r.id);
        assignments.push({ sectionKey: key, subject: sc, teacher: teacherIds[tk] });
      }
    }

    // ---- Bell schedule and timetable (teacher clashes avoided)
    const havePeriods = await one('SELECT count(*) AS n FROM timetable_periods WHERE academic_year_id=$1', [Y], c);
    if (!havePeriods.n) {
      const P: [number, string, string, string, boolean][] = [[1, 'Period 1', '08:00', '08:40', false], [2, 'Period 2', '08:40', '09:20', false], [3, 'Period 3', '09:20', '10:00', false],
        [4, 'Lunch', '10:00', '10:30', true], [5, 'Period 4', '10:30', '11:10', false], [6, 'Period 5', '11:10', '11:50', false], [7, 'Period 6', '11:50', '12:30', false]];
      for (const [n, l, a, b, br] of P) {
        const r = await one('INSERT INTO timetable_periods (academic_year_id, period_no, label, start_time, end_time, is_break) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [Y, n, l, a, b, br], c);
      }
      const periods = await q('SELECT id, is_break FROM timetable_periods WHERE academic_year_id=$1 ORDER BY period_no', [Y], c);
      const busy = new Set<string>();
      for (const [key] of SECTIONS) {
        const subs = assignments.filter((a) => a.sectionKey === key);
        let k = 0;
        for (let day = 1; day <= 6; day++) {
          for (const p of periods) {
            if (p.is_break) continue;
            for (let tries = 0; tries < subs.length; tries++) {
              const a = subs[(k + tries) % subs.length];
              const slot = `${a.teacher}:${day}:${p.id}`;
              if (busy.has(slot)) continue;
              busy.add(slot);
              await c.query('INSERT INTO timetable_entries (section_id, period_id, day_of_week, subject_id, teacher_id) VALUES ($1,$2,$3,$4,$5)', [sectionIds[key], p.id, day, subjects[a.subject], a.teacher]);
              break;
            }
            k++;
          }
        }
      }
    }

    // ---- Fees
    const cat = async (code: string) => (await one('SELECT id FROM fee_categories WHERE code=$1', [code], c)).id as number;
    const plan = async (name: string, type: string, classCode: string | null, items: [string, number, string][]) => {
      const p = await one(`INSERT INTO fee_plans (academic_year_id, name, plan_type, class_level_id, description) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [Y, name, type, classCode ? await cl(classCode) : null, 'Sample plan – edit amounts as per school fee structure'], c);
      await reg('fee_plans', p.id);
      for (const [code, rupees, freq] of items) await c.query('INSERT INTO fee_plan_items (fee_plan_id, fee_category_id, amount_paise, frequency) VALUES ($1,$2,$3,$4)', [p.id, await cat(code), rupees * 100, freq]);
      return p.id as number;
    };
    const plans: Record<string, number> = {};
    const band: Record<string, [number, number, number]> = {
      NUR: [1200, 300, 1500], '1': [1400, 400, 1800], '2': [1400, 400, 1800], '3': [1500, 400, 2000], '4': [1500, 400, 2000], '5': [1600, 500, 2200], '6': [1800, 600, 2600],
      '7': [1800, 600, 2600], '8': [1900, 600, 2800], '9': [2200, 800, 3200], '10': [2300, 800, 3500], '11': [2600, 900, 3800], '12': [2700, 900, 4000] };
    for (const [code, [tuition, exam, books]] of Object.entries(band)) {
      plans[code] = await plan(`Class ${code} ${yearRow.name}`, 'school', code, [['ADMISSION', 3000, 'one_time'], ['TUITION', tuition, 'monthly'], ['ANNUAL', 2500, 'annual'], ['EXAM', exam, 'half_yearly'], ['UNIFORM', 1800, 'one_time'], ['BOOKS', books, 'annual']]);
    }
    plans.hostel = await plan(`Hostel ${yearRow.name}`, 'hostel', null, [['HOSTEL', 4500, 'monthly'], ['MESS', 3000, 'monthly']]);
    const routes: number[] = [];
    for (const [name, stops, fee] of [['Route 1 – Boring Road', 'Boring Road, Patliputra, Rajapur Pul', 800], ['Route 2 – Kankarbagh', 'Kankarbagh, Patna Junction, Rajendra Nagar', 900], ['Route 3 – Danapur', 'Danapur, Saguna More, Bailey Road', 1100]] as [string, string, number][]) {
      const r = await one(`INSERT INTO transport_routes (name, stops, monthly_fee_paise, vehicle_no, driver_name) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (name) DO NOTHING RETURNING id`,
        [name, stops, fee * 100, `BR01-PA-${between(1000, 9999)}`, pick(['Ramesh', 'Sohan', 'Mohan'])], c);
      if (r) { await reg('transport_routes', r.id); routes.push(r.id); }
    }

    // ---- Hostels
    const hostelRooms: Record<'male' | 'female', { roomId: number; beds: number[] }[]> = { male: [], female: [] };
    for (const [hname, type, gender] of [['Boys Hostel', 'boys', 'male'], ['Girls Hostel', 'girls', 'female']] as const) {
      let h = await one('SELECT id FROM hostels WHERE name=$1', [hname], c);
      if (h) continue;
      h = await one(`INSERT INTO hostels (name, hostel_type, warden_name, warden_phone, emergency_phone, building) VALUES ($1,$2,$3,'+91 90000 22222','+91 90000 33333',$4) RETURNING id`,
        [hname, type, gender === 'male' ? 'Mr. S. K. Pandey' : 'Mrs. R. Sinha', gender === 'male' ? 'Block A' : 'Block B'], c);
      await reg('hostels', h.id);
      for (let i = 1; i <= 4; i++) {
        const cap = i === 4 ? 2 : 3;
        const r = await one('INSERT INTO hostel_rooms (hostel_id, room_no, floor, capacity, room_type) VALUES ($1,$2,$3,$4,$5) RETURNING id', [h.id, `${gender === 'male' ? 'A' : 'B'}-10${i}`, '1', cap, 'Non-AC'], c);
        await reg('hostel_rooms', r.id);
        const beds: number[] = [];
        for (let b = 1; b <= cap; b++) { const bed = await one('INSERT INTO hostel_beds (room_id, bed_no) VALUES ($1,$2) RETURNING id', [r.id, `B${b}`], c); await reg('hostel_beds', bed.id); beds.push(bed.id); }
        hostelRooms[gender].push({ roomId: r.id, beds });
      }
    }

    // ---- Students
    const yearStart = yearRow.start_date.slice(0, 4);
    // A small, tidy sample: 2–3 students in every class; from Class 6 upwards the first student is a hostel resident.
    const classNo = (code: string) => (code === 'NUR' ? 0 : Number(code));
    let k = 0;
    const freeBeds = { male: hostelRooms.male.flatMap((r) => r.beds.map((b) => ({ bed: b, room: r.roomId }))), female: hostelRooms.female.flatMap((r) => r.beds.map((b) => ({ bed: b, room: r.roomId }))) };
    for (const [key, code] of SECTIONS.map((x) => [x[0], x[1]])) {
      const count = classNo(code) % 2 === 0 ? 3 : 2;
      for (let i = 1; i <= count; i++, k++) {
        const female = k % 2 === 1;
        const fn = female ? GIRLS[k % GIRLS.length] : BOYS[k % BOYS.length];
        const ln = SURNAMES[(k * 7) % SURNAMES.length];
        const sn = await nextCounter(c, `student_code:${yearStart}`);
        const studentCode = `${s.student_id_prefix}${yearStart}${pad(sn, 4)}`;
        const an = await nextCounter(c, 'admission_no');
        const cr = await credFor();
        const u = await one(`INSERT INTO users (username, password_hash, role, display_name, is_demo, must_change_password) VALUES ($1,$2,'student',$3,true,$4) RETURNING id`,
          [studentCode, cr.hash, `${fn} ${ln}`, cr.mustChange], c);
        const dob = `${Number(yearStart) - (classNo(code) + 6)}-${String(between(1, 12)).padStart(2, '0')}-${String(between(1, 28)).padStart(2, '0')}`;
        const st = await one(`INSERT INTO students (user_id, student_code, admission_no, first_name, last_name, dob, gender, blood_group, address, emergency_contact_name, emergency_contact_phone, admission_date, is_demo)
                              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true) RETURNING id`,
          [u.id, studentCode, `${s.admission_prefix}${pad(an, 5)}`, fn, ln, dob, female ? 'female' : 'male', pick(['A+', 'B+', 'O+', 'AB+', 'B-']),
            `${between(1, 250)}, ${pick(ROADS)}, Patna`, `${FATHERS[k % FATHERS.length]} ${ln}`, `+91 9${between(100000000, 999999999)}`, yearRow.start_date], c);
        const father = await one(`INSERT INTO guardians (name, phone, occupation, is_demo) VALUES ($1,$2,$3,true) RETURNING id`, [`${FATHERS[k % FATHERS.length]} ${ln}`, `+91 9${between(100000000, 999999999)}`, pick(['Business', 'Service', 'Teacher', 'Doctor', 'Farmer', 'Engineer'])], c);
        await c.query(`INSERT INTO student_guardians (student_id, guardian_id, relation, is_primary) VALUES ($1,$2,'Father',true)`, [st.id, father.id]);
        const hostel = classNo(code) >= 6 && i === 1; // hosteller; everyone else is a day scholar (school 9 to 4, then home)
        const transport = !hostel && routes.length > 0 && rand() < 0.4;
        const secRow = await one('SELECT class_level_id FROM sections WHERE id=$1', [sectionIds[key]], c);
        const roll = (await one('SELECT coalesce(max(roll_no), 0) + 1 AS n FROM enrollments WHERE section_id = $1', [sectionIds[key]], c)).n;
        const e = await one(`INSERT INTO enrollments (student_id, academic_year_id, section_id, class_level_id, roll_no, residency, transport_opted, transport_route_id, enrolled_on)
                             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [st.id, Y, sectionIds[key], secRow.class_level_id, roll, hostel ? 'hostel' : 'day_scholar', transport, transport ? pick(routes) : null, yearRow.start_date], c);
        await assignPlan(c as PoolClient, e.id, plans[code], null);
        if (hostel) {
          await assignPlan(c as PoolClient, e.id, plans.hostel, null);
          const bed = freeBeds[female ? 'female' : 'male'].shift();
          if (bed) await c.query('INSERT INTO hostel_allocations (student_id, bed_id, room_id, check_in, allocated_by) VALUES ($1,$2,$3,$4,$5)', [st.id, bed.bed, bed.room, yearRow.start_date, actor]);
        }
        if (k % 9 === 0) {
          const cn = await one(`INSERT INTO concessions (enrollment_id, fee_category_id, label, kind, percent_bp, reason, approved_by) VALUES ($1,$2,'scholarship','percent',2500,'Merit scholarship (sample)',$3) RETURNING id`, [e.id, await cat('TUITION'), actor], c);
          void cn;
        }
        enrollmentsToBill.push(e.id);
        (studentsByClass[key] ??= []).push({ studentId: st.id, enrollmentId: e.id, sectionId: sectionIds[key], userId: u.id });
        if (i <= 2) result.students.push({ name: `${fn} ${ln}`, username: studentCode + (cr.mustChange ? `  (temporary password: ${cr.pw})` : ''), className: key });
      }
    }

    // ---- Attendance for the last ~25 school days
    const days: string[] = [];
    for (let d = today; days.length < 25 && d >= yearRow.start_date; d = addDays(d, -1)) {
      if (new Date(d + 'T00:00:00Z').getUTCDay() !== 0) days.push(d);
    }
    let att = 0;
    for (const [key, list] of Object.entries(studentsByClass)) {
      const ctUser = teacherUserIds[teacherIds[SECTIONS.find((x) => x[0] === key)![5]]];
      for (const d of days) {
        for (const st of list) {
          const r = rand();
          const status = r < 0.86 ? 'present' : r < 0.92 ? 'absent' : r < 0.96 ? 'late' : r < 0.98 ? 'half_day' : 'leave';
          await c.query(`INSERT INTO attendance_records (student_id, enrollment_id, section_id, date, status, marked_by, marked_at) VALUES ($1,$2,$3,$4,$5,$6,$7::date + time '08:15')`,
            [st.studentId, st.enrollmentId, st.sectionId, d, status, ctUser, d]);
          att++;
        }
      }
    }
    result.summary.attendanceRecords = att;

    // ---- Exams: published Unit Test 1 and the upcoming Half Yearly examination
    const scale = await one('SELECT id FROM grading_scales WHERE is_default ORDER BY id LIMIT 1', [], c);
    const ut = await one(`INSERT INTO exams (academic_year_id, name, exam_type, assessment_mode, grading_scale_id, pass_percent, start_date, end_date, schedule_published, status, published_at, published_by)
                          VALUES ($1,'Unit Test 1','unit','marks',$2,33,$3,$4,true,'published',now(),$5) RETURNING id`, [Y, scale?.id ?? null, addDays(today, -40), addDays(today, -35), actor], c);
    await reg('exams', ut.id);
    for (const [key, code] of SECTIONS.map((x) => [x[0], x[1]])) {
      for (const sc of CLASS_SUBJECTS[code]) {
        const es = await one(`INSERT INTO exam_subjects (exam_id, class_level_id, subject_id, max_marks, pass_marks, exam_date) VALUES ($1,$2,$3,25,8,$4)
                              ON CONFLICT (exam_id, class_level_id, subject_id) DO UPDATE SET max_marks = 25 RETURNING id`, [ut.id, await cl(code), subjects[sc], addDays(today, -40 + CLASS_SUBJECTS[code].indexOf(sc))], c);
        const tch = assignments.find((a) => a.sectionKey === key && a.subject === sc)!.teacher;
        for (const st of studentsByClass[key]) {
          const absent = rand() < 0.03;
          const m = absent ? null : Math.min(25, Math.max(4, Math.round((12 + rand() * 13) * 2) / 2));
          await c.query(`INSERT INTO marks (exam_subject_id, student_id, enrollment_id, marks_obtained, is_absent, entered_by) VALUES ($1,$2,$3,$4,$5,$6)`,
            [es.id, st.studentId, st.enrollmentId, m, absent, teacherUserIds[tch]]);
        }
        await c.query(`INSERT INTO mark_submissions (exam_subject_id, section_id, status, submitted_by, submitted_at, reviewed_by, reviewed_at) VALUES ($1,$2,'approved',$3,now(),$4,now())`,
          [es.id, sectionIds[key], teacherUserIds[tch], actor]);
      }
      for (const st of studentsByClass[key]) {
        await c.query(`INSERT INTO report_card_remarks (exam_id, student_id, teacher_remark) VALUES ($1,$2,$3)`, [ut.id, st.studentId,
          pick(['Sincere and attentive in class.', 'Good progress. Needs more practice in written work.', 'Excellent participation. Keep it up!', 'Can do better with regular revision.', 'Very disciplined and hardworking.'])]);
      }
    }
    const hy = await one(`INSERT INTO exams (academic_year_id, name, exam_type, assessment_mode, grading_scale_id, pass_percent, start_date, end_date, schedule_published, status)
                          VALUES ($1,'Half Yearly Examination','half_yearly','marks',$2,33,$3,$4,true,'marks_entry') RETURNING id`, [Y, scale?.id ?? null, addDays(today, 10), addDays(today, 18), ], c);
    await reg('exams', hy.id);
    for (const code of Object.keys(CLASS_SUBJECTS)) {
      let n = 0;
      for (const sc of CLASS_SUBJECTS[code]) {
        await c.query(`INSERT INTO exam_subjects (exam_id, class_level_id, subject_id, max_marks, pass_marks, exam_date, start_time, duration_min) VALUES ($1,$2,$3,80,27,$4,'09:00',180)`,
          [hy.id, await cl(code), subjects[sc], addDays(today, 10 + n++)]);
      }
    }

    // ---- Homework, materials and a quiz
    const HW: Record<string, [string, string]> = {
      ENG: ['Write a paragraph on "My Favourite Festival"', 'Write 120–150 words. Use at least five new words from the lesson.'],
      HIN: ['पाठ 4 के प्रश्न-उत्तर लिखिए', 'अभ्यास पुस्तिका में साफ़ अक्षरों में लिखें।'],
      MATH: ['Exercise 3.2 – all questions', 'Show complete working for every question.'],
      SCI: ['Draw and label the parts of a plant cell', 'Use a pencil and colour the diagram neatly.'],
      SST: ['Map work: rivers of India', 'Mark the major rivers on the outline map provided.'],
      EVS: ['Make a list of 10 things we get from plants', 'Paste pictures if possible.'],
      COMP: ['Type a short story in MS Word', 'Use headings, bold and bullet points.'],
      PHY: ['Numericals on Ohm’s law', 'Solve the 10 problems from the worksheet.'],
      CHEM: ['Balance the given chemical equations', 'Worksheet 2.'],
      BIO: ['Notes on the human digestive system', 'Include a labelled diagram.'],
    };
    for (const a of assignments) {
      if (!HW[a.subject] || rand() < 0.4) continue;
      const [title, desc] = HW[a.subject];
      const due = addDays(today, between(-6, 6));
      const r = await one(`INSERT INTO assignments (section_id, subject_id, teacher_id, title, description, due_date, max_marks) VALUES ($1,$2,$3,$4,$5,$6,10) RETURNING id`,
        [sectionIds[a.sectionKey], subjects[a.subject], a.teacher, title, desc, due], c);
      for (const st of studentsByClass[a.sectionKey] ?? []) {
        const x = rand();
        if (x < 0.35) continue;
        await c.query(`INSERT INTO assignment_submissions (assignment_id, student_id, text_answer, submitted_at, status, marks, feedback, reviewed_by, reviewed_at) VALUES ($1,$2,$3,now() - interval '1 day',$4,$5,$6,$7,$8)`,
          [r.id, st.studentId, 'Completed in notebook – sample submission.', x < 0.7 ? 'submitted' : 'completed', x < 0.7 ? null : between(6, 10), x < 0.7 ? null : 'Good work!', x < 0.7 ? null : teacherUserIds[a.teacher], x < 0.7 ? null : new Date()]);
      }
    }
    for (const key of ['5A', '8A', '10A']) {
      const a = assignments.find((x) => x.sectionKey === key && x.subject === 'MATH')!;
      const quiz = await one(`INSERT INTO quizzes (section_id, subject_id, teacher_id, title, instructions, time_limit_min, available_from, available_until, status)
                              VALUES ($1,$2,$3,'Quick Maths Quiz','Answer all questions. Each question carries marks as shown.',15, now() - interval '1 day', now() + interval '7 days','published') RETURNING id`,
        [sectionIds[key], subjects.MATH, a.teacher], c);
      const QS: [string, string, any, number][] = [['mcq', 'What is 15% of 200?', { options: ['20', '30', '25', '35'], correct: 1 }, 2], ['true_false', 'Every square is a rectangle.', { correct: true }, 1],
        ['mcq', 'The value of 7 × 8 is', { options: ['54', '56', '58', '64'], correct: 1 }, 1], ['short_answer', 'Explain what a prime number is.', { key: 'A number with exactly two factors, 1 and itself.' }, 3]];
      let o = 0;
      for (const [t, prompt, d, marks] of QS) {
        await c.query(`INSERT INTO quiz_questions (quiz_id, qtype, prompt, options, correct_option, correct_bool, answer_key, marks, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [quiz.id, t, prompt, t === 'mcq' ? JSON.stringify(d.options) : t === 'true_false' ? JSON.stringify(['True', 'False']) : null, t === 'mcq' ? d.correct : null, t === 'true_false' ? d.correct : null, d.key ?? null, marks, o++]);
      }
    }
    for (const key of ['5A', '10A']) {
      await c.query(`INSERT INTO study_materials (section_id, subject_id, teacher_id, title, description, link_url) VALUES ($1,$2,$3,'NCERT textbook – online','Official NCERT e-books for reference.','https://ncert.nic.in/textbook.php')`,
        [sectionIds[key], subjects.MATH, teacherIds.rakesh]);
    }

    // ---- Notices, events and enquiries
    const NOTICES: [string, string, string, string, boolean][] = [
      ['Admissions open for the new session', 'नए सत्र के लिए प्रवेश प्रारंभ', 'Admissions are open from Nursery to Class 12 for day scholars and hostel residents. Visit the school office between 9 AM and 2 PM or fill the online enquiry form.', 'public', true],
      ['Parent–Teacher Meeting on Saturday', 'शनिवार को अभिभावक–शिक्षक बैठक', 'All parents are requested to attend the PTM from 10 AM to 1 PM to discuss the Unit Test 1 performance.', 'all', false],
      ['Half Yearly Examination schedule released', 'अर्धवार्षिक परीक्षा कार्यक्रम जारी', 'The date sheet for the Half Yearly Examination is now available in the student portal.', 'students', false],
      ['Annual Sports Day registrations', 'वार्षिक खेल दिवस पंजीकरण', 'Students interested in athletics events should give their names to their class teacher by Friday.', 'public', false],
      ['Staff meeting', 'स्टाफ बैठक', 'All teachers to assemble in the conference room at 1:30 PM on Monday.', 'teachers', false],
    ];
    let ni = 0;
    for (const [t, th, b, aud, pin] of NOTICES) {
      const r = await one(`INSERT INTO notices (title, title_hi, body, audience, pinned, publish_at, created_by) VALUES ($1,$2,$3,$4,$5, now() - ($6 || ' days')::interval, $7) RETURNING id`, [t, th, b, aud, pin, String(ni++ * 2), actor], c);
      await reg('notices', r.id);
    }
    const EVENTS: [string, string, string, number, number | null, string][] = [
      ['Parent–Teacher Meeting', 'अभिभावक–शिक्षक बैठक', 'meeting', 4, null, 'School Auditorium'], ['Science Exhibition', 'विज्ञान प्रदर्शनी', 'activity', 12, 13, 'Science Block'],
      ['Half Yearly Examinations', 'अर्धवार्षिक परीक्षा', 'exam', 10, 18, 'Classrooms'], ['Diwali Holidays', 'दीपावली अवकाश', 'holiday', 20, 24, ''],
      ['Annual Sports Day', 'वार्षिक खेल दिवस', 'event', 32, null, 'School Ground'], ['Children’s Day Celebration', 'बाल दिवस समारोह', 'activity', 34, null, 'Auditorium'],
    ];
    for (const [t, th, type, a, b, loc] of EVENTS) {
      const r = await one(`INSERT INTO events (title, title_hi, event_type, start_date, end_date, location, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [t, th, type, addDays(today, a), b ? addDays(today, b) : null, loc || null, actor], c);
      await reg('events', r.id);
    }
    for (const [child, cls, parent] of [['Advik Raj', 'Class 2', 'Pankaj Raj'], ['Ira Sinha', 'Class 1', 'Neeraj Sinha'], ['Om Prakash', 'Class 9', 'Ram Prakash']]) {
      const r = await one(`INSERT INTO admission_enquiries (student_name, class_sought, parent_name, phone, message) VALUES ($1,$2,$3,'+91 90000 44444','Please share the fee structure and admission process.') RETURNING id`, [child, cls, parent], c);
      await reg('admission_enquiries', r.id);
    }
    result.summary.students = enrollmentsToBill.length;
    result.summary.teachers = TEACHERS.length;
  });

  // ---- Invoices from the start of the session to the current month, and realistic payment history
  log('Generating invoices and payments…');
  const thisMonth = today.slice(0, 7);
  for (const eid of enrollmentsToBill) {
    for (let m = yearRow.start_date.slice(0, 7); m <= thisMonth && m <= yearRow.end_date.slice(0, 7); m = addMonths(m, 1)) {
      await generateForEnrollment(eid, m, actor);
    }
  }
  let payments = 0;
  if (actor) {
    const studs = await q(`SELECT e.student_id FROM enrollments e WHERE e.id = ANY($1) ORDER BY e.id`, [enrollmentsToBill]);
    for (const { student_id } of studs) {
      const profile = rand(); // ~45% fully paid, ~35% partly paid, ~20% only first instalment
      const invoices = await q(`SELECT invoice_id, min(due_date) AS due, sum(outstanding_paise) AS out FROM fee_line_balances WHERE student_id = $1 GROUP BY invoice_id ORDER BY due`, [student_id]);
      const payUpTo = profile < 0.45 ? invoices.length : profile < 0.8 ? Math.max(1, invoices.length - 2) : 1;
      for (let i = 0; i < payUpTo; i++) {
        const inv = invoices[i];
        if (!inv || inv.out <= 0) continue;
        let paidOn = addDays(inv.due, -between(0, 8));
        if (paidOn > today) paidOn = today;
        if (paidOn < yearRow.start_date) paidOn = yearRow.start_date;
        const mode = pick(['cash', 'cash', 'upi', 'upi', 'bank_transfer', 'cheque']);
        await recordPayment({ studentId: student_id, amountPaise: inv.out, mode, reference: mode === 'cash' ? null : `TXN${between(100000, 999999)}`, paidOn,
          idempotencyKey: `demo-${student_id}-${inv.invoice_id}`, invoiceIds: [inv.invoice_id] }, actor);
        payments++;
      }
    }
  }
  result.summary.payments = payments;
  await pool.query('ANALYZE'); // refresh planner statistics after the bulk load
  log(`Sample data loaded: ${result.summary.teachers} teachers, ${result.summary.students} students, ${result.summary.attendanceRecords} attendance records, ${payments} payments.`);
  return result;
}

/** Delete all demo-flagged records and their dependent rows. Real records are never touched. */
export async function removeDemo(log: (m: string) => void = console.log) {
  await tx(async (c) => {
    const ds = `(SELECT id FROM students WHERE is_demo)`;
    const dt = `(SELECT id FROM teachers WHERE is_demo)`;
    const dx = `(SELECT record_id FROM demo_records WHERE table_name = 'exams')`;
    const steps = [
      `DELETE FROM quiz_answers WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE student_id IN ${ds} OR quiz_id IN (SELECT id FROM quizzes WHERE teacher_id IN ${dt}))`,
      `DELETE FROM quiz_attempts WHERE student_id IN ${ds} OR quiz_id IN (SELECT id FROM quizzes WHERE teacher_id IN ${dt})`,
      `DELETE FROM quiz_questions WHERE quiz_id IN (SELECT id FROM quizzes WHERE teacher_id IN ${dt})`,
      `DELETE FROM quizzes WHERE teacher_id IN ${dt}`,
      `DELETE FROM assignment_submissions WHERE student_id IN ${ds} OR assignment_id IN (SELECT id FROM assignments WHERE teacher_id IN ${dt})`,
      `DELETE FROM assignments WHERE teacher_id IN ${dt}`,
      `DELETE FROM study_materials WHERE teacher_id IN ${dt}`,
      `DELETE FROM report_card_remarks WHERE student_id IN ${ds} OR exam_id IN ${dx}`,
      `DELETE FROM development_assessments WHERE student_id IN ${ds} OR exam_id IN ${dx}`,
      `DELETE FROM marks WHERE student_id IN ${ds} OR exam_subject_id IN (SELECT id FROM exam_subjects WHERE exam_id IN ${dx})`,
      `DELETE FROM mark_submissions WHERE exam_subject_id IN (SELECT id FROM exam_subjects WHERE exam_id IN ${dx})`,
      `DELETE FROM exam_subjects WHERE exam_id IN ${dx}`,
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
      `DELETE FROM timetable_entries WHERE teacher_id IN ${dt} OR section_id IN (SELECT record_id FROM demo_records WHERE table_name = 'sections')`,
      `DELETE FROM teaching_assignments WHERE teacher_id IN ${dt}`,
      `UPDATE sections SET class_teacher_id = NULL WHERE class_teacher_id IN ${dt}`,
      `DELETE FROM teachers WHERE is_demo`,
      `DELETE FROM notices WHERE title LIKE '[DEMO]%'`,
    ];
    for (const sql of steps) await c.query(sql);
    // Configuration rows created by the seed, unless real records still use them.
    // School structure (academic year, sections, subjects, bell schedule) is kept so the school stays ready to use.
    const order = ['notices', 'events', 'admission_enquiries', 'exams', 'hostel_beds', 'hostel_rooms', 'hostels', 'transport_routes', 'fee_plans', 'teaching_assignments',
      'class_subjects', 'timetable_periods', 'sections', 'terms', 'subjects', 'academic_years'];
    for (const table of order) {
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
  // Older sample data may have created the academic year; make sure the school is never left without classes.
  const { bootstrapAcademics } = await import('../services/setup.js');
  await bootstrapAcademics(log);
  log('Sample data removed.');
  void pool;
}

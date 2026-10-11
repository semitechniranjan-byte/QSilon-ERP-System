import { Router } from 'express';
import { one, q } from '../db/pool.js';
import { ah, forbidden } from '../lib/errors.js';
import { can } from '../middleware/auth.js';
import { todayIST } from '../lib/dates.js';
import { feedFor } from './notices.js';

export const dashboardRouter = Router();

dashboardRouter.get('/admin', ah(async (req, res) => {
  if (!can(req, 'reports.view') && !can(req, 'fees.view')) throw forbidden();
  const today = todayIST();
  const fees = can(req, 'fees.view');
  const full = can(req, 'reports.view');
  const year = await one('SELECT id, name, start_date, end_date FROM academic_years WHERE is_current');
  const yid = year?.id ?? -1;
  const [counts, bySection, attendance, feeSummary, collectionTrend, newAdmissions, upcomingExams, pending, activity] = await Promise.all([
    one(`SELECT count(*) FILTER (WHERE e.status='active') AS students,
                count(*) FILTER (WHERE e.status='active' AND cl.is_preschool) AS preschool,
                count(*) FILTER (WHERE e.status='active' AND e.residency='hostel') AS hostel,
                count(*) FILTER (WHERE e.status='active' AND e.residency='day_scholar') AS day_scholars,
                count(*) FILTER (WHERE e.status='active' AND e.transport_opted) AS transport,
                (SELECT count(*) FROM teachers WHERE status='active') AS teachers,
                (SELECT count(*) FROM sections WHERE academic_year_id=$1 AND is_active) AS sections
           FROM enrollments e JOIN class_levels cl ON cl.id = e.class_level_id WHERE e.academic_year_id = $1`, [yid]),
    full ? q(`SELECT cl.name AS class_name, s.name AS section_name, cl.sort_order, cl.is_preschool,
                     count(e.id) FILTER (WHERE e.status='active') AS students,
                     count(e.id) FILTER (WHERE e.status='active' AND st.gender='male') AS boys,
                     count(e.id) FILTER (WHERE e.status='active' AND st.gender='female') AS girls
                FROM sections s JOIN class_levels cl ON cl.id = s.class_level_id LEFT JOIN enrollments e ON e.section_id = s.id LEFT JOIN students st ON st.id = e.student_id
               WHERE s.academic_year_id = $1 GROUP BY cl.name, s.name, cl.sort_order, cl.is_preschool ORDER BY cl.sort_order, s.name`, [yid]) : [],
    one(`SELECT count(*) AS marked, count(*) FILTER (WHERE status IN ('present','late')) AS present, count(*) FILTER (WHERE status='absent') AS absent,
                count(*) FILTER (WHERE status='half_day') AS half_day, count(*) FILTER (WHERE status='leave') AS leave,
                (SELECT count(*) FROM sections s WHERE s.academic_year_id=$2 AND s.is_active AND EXISTS (SELECT 1 FROM enrollments e WHERE e.section_id=s.id AND e.status='active')
                    AND NOT EXISTS (SELECT 1 FROM attendance_records a WHERE a.section_id = s.id AND a.date = $1)) AS sections_pending
           FROM attendance_records WHERE date = $1 AND session = 'full_day'`, [today, yid]),
    fees ? one(`SELECT (SELECT coalesce(sum(amount_paise),0) FROM payments WHERE status='completed' AND paid_on = $1) AS today,
                       (SELECT coalesce(sum(amount_paise),0) FROM payments WHERE status='completed' AND date_trunc('month', paid_on) = date_trunc('month', $1::date)) AS month,
                       (SELECT coalesce(sum(outstanding_paise),0) FROM fee_line_balances WHERE academic_year_id = $2) AS outstanding,
                       (SELECT coalesce(sum(outstanding_paise),0) FROM fee_line_balances WHERE academic_year_id = $2 AND due_date < $1) AS overdue,
                       (SELECT coalesce(sum(net_paise),0) FROM fee_line_balances WHERE academic_year_id = $2) AS billed,
                       (SELECT count(DISTINCT student_id) FROM fee_line_balances WHERE academic_year_id = $2 AND due_date < $1 AND outstanding_paise > 0) AS overdue_students`, [today, yid]) : null,
    fees ? q(`SELECT paid_on AS date, sum(amount_paise) AS amount_paise FROM payments WHERE status='completed' AND paid_on > $1::date - 30 GROUP BY paid_on ORDER BY paid_on`, [today]) : [],
    full ? q(`SELECT st.id, st.first_name, st.last_name, st.student_code, st.admission_date, cl.name AS class_name, sec.name AS section_name
                FROM students st JOIN enrollments e ON e.student_id = st.id AND e.academic_year_id = $1 JOIN class_levels cl ON cl.id = e.class_level_id JOIN sections sec ON sec.id = e.section_id
               WHERE st.created_at > now() - interval '30 days' ORDER BY st.created_at DESC LIMIT 10`, [yid]) : [],
    full ? q(`SELECT x.id, x.name, x.start_date, x.end_date, x.status FROM exams x WHERE x.academic_year_id = $1 AND (x.start_date IS NULL OR x.end_date IS NULL OR x.end_date >= $2) AND x.status <> 'published'
               ORDER BY x.start_date NULLS LAST LIMIT 5`, [yid, today]) : [],
    full ? one(`SELECT (SELECT count(*) FROM admission_enquiries WHERE status='new') AS enquiries,
                       (SELECT count(*) FROM profile_correction_requests WHERE status='pending') AS corrections,
                       (SELECT count(*) FROM password_reset_requests WHERE status='pending') AS password_resets,
                       (SELECT count(*) FROM mark_submissions WHERE status='submitted') AS marks_review`) : null,
    can(req, 'audit.view') ? q(`SELECT a.action, a.entity_type, a.entity_id, a.at, u.display_name FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
                                 WHERE a.action NOT IN ('auth.login') ORDER BY a.at DESC LIMIT 12`) : [],
  ]);
  res.json({ year, today, counts, bySection, attendance, feeSummary, collectionTrend, newAdmissions, upcomingExams, pending, activity, notices: await feedFor(req, 6) });
}));

dashboardRouter.get('/teacher', ah(async (req, res) => {
  const u = req.user!;
  if (u.role !== 'teacher') throw forbidden();
  const tid = u.teacherId!;
  const today = todayIST();
  const dow = ((new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1; // Monday = 1
  const [teacher, assignments, classTeacherOf, timetable, attendanceTasks, reviewQueue, exams] = await Promise.all([
    one('SELECT id, employee_code, first_name, last_name, designation, photo_file_id FROM teachers WHERE id=$1', [tid]),
    q(`SELECT ta.section_id, ta.subject_id, sub.name AS subject_name, cl.name AS class_name, s.name AS section_name, cl.is_preschool,
              (SELECT count(*) FROM enrollments e WHERE e.section_id = s.id AND e.status = 'active') AS students
         FROM teaching_assignments ta JOIN sections s ON s.id = ta.section_id JOIN academic_years y ON y.id = s.academic_year_id AND y.is_current
         JOIN class_levels cl ON cl.id = s.class_level_id JOIN subjects sub ON sub.id = ta.subject_id WHERE ta.teacher_id = $1 ORDER BY cl.sort_order, s.name, sub.name`, [tid]),
    q(`SELECT s.id, cl.name AS class_name, s.name AS section_name, cl.is_preschool FROM sections s JOIN class_levels cl ON cl.id = s.class_level_id
         JOIN academic_years y ON y.id = s.academic_year_id AND y.is_current WHERE s.class_teacher_id = $1`, [tid]),
    q(`SELECT p.period_no, p.start_time, p.end_time, sub.name AS subject_name, cl.name AS class_name, s.name AS section_name, e.room
         FROM timetable_entries e JOIN timetable_periods p ON p.id = e.period_id JOIN academic_years y ON y.id = p.academic_year_id AND y.is_current
         JOIN sections s ON s.id = e.section_id JOIN class_levels cl ON cl.id = s.class_level_id LEFT JOIN subjects sub ON sub.id = e.subject_id
        WHERE e.teacher_id = $1 AND e.day_of_week = $2 ORDER BY p.period_no`, [tid, dow]),
    q(`SELECT s.id AS section_id, cl.name AS class_name, s.name AS section_name,
              EXISTS (SELECT 1 FROM attendance_records a WHERE a.section_id = s.id AND a.date = $2) AS done
         FROM sections s JOIN class_levels cl ON cl.id = s.class_level_id JOIN academic_years y ON y.id = s.academic_year_id AND y.is_current
        WHERE s.class_teacher_id = $1`, [tid, today]),
    one(`SELECT (SELECT count(*) FROM assignment_submissions x JOIN assignments a ON a.id = x.assignment_id WHERE a.teacher_id = $1 AND x.status = 'submitted') AS submissions,
                (SELECT count(*) FROM quiz_attempts x JOIN quizzes qz ON qz.id = x.quiz_id WHERE qz.teacher_id = $1 AND x.status = 'pending_review') AS quiz_reviews,
                (SELECT count(*) FROM mark_submissions ms JOIN teaching_assignments ta ON ta.section_id = ms.section_id
                   JOIN exam_subjects es ON es.id = ms.exam_subject_id AND es.subject_id = ta.subject_id WHERE ta.teacher_id = $1 AND ms.status = 'returned') AS marks_returned`, [tid]),
    q(`SELECT x.id, x.name, x.start_date, x.end_date, x.status, x.assessment_mode FROM exams x JOIN academic_years y ON y.id = x.academic_year_id AND y.is_current
        WHERE x.status = 'marks_entry' OR (x.schedule_published AND (x.end_date IS NULL OR x.end_date >= $1)) ORDER BY x.start_date NULLS LAST LIMIT 8`, [today]),
  ]);
  res.json({ today, teacher, assignments, classTeacherOf, timetable, attendanceTasks, reviewQueue, exams, notices: await feedFor(req, 6) });
}));

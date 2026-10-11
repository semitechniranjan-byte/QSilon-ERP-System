import { Link } from 'react-router-dom';
import { BookOpen, ClipboardCheck, ClipboardList, FileQuestion, NotebookPen, Users } from 'lucide-react';
import { Async, Badge, Card, PageHeader, StatCard, StatusBadge, useApi } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { fmtDate, fullName } from '../../lib/format';

export default function TeacherDashboard() {
  const { t, pick } = useI18n();
  const q = useApi<any>('/api/dashboard/teacher');
  return (
    <Async q={q}>{(d) => {
      const sections = [...new Map(d.assignments.map((a: any) => [a.section_id, a])).values()] as any[];
      const pending = d.attendanceTasks.filter((x: any) => !x.done);
      return (
        <>
          <PageHeader title={`${t('Dashboard')} – ${fullName(d.teacher)}`} subtitle={`${d.teacher.employee_code} · ${fmtDate(d.today)}`} />
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label={t('Assigned classes')} value={sections.length} icon={<Users className="h-5 w-5" />} to="/teacher/classes" />
            <StatCard label={t('Subjects')} value={new Set(d.assignments.map((a: any) => a.subject_id)).size} icon={<BookOpen className="h-5 w-5" />} tone="green" />
            <StatCard label={t('Attendance tasks')} value={pending.length} icon={<ClipboardCheck className="h-5 w-5" />} tone={pending.length ? 'amber' : 'green'} to="/teacher/attendance" />
            <StatCard label={t('Pending reviews')} value={d.reviewQueue.submissions + d.reviewQueue.quiz_reviews + d.reviewQueue.marks_returned} icon={<ClipboardList className="h-5 w-5" />} tone="purple" />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title={t('Today’s timetable')} className="lg:col-span-2" actions={<Link className="link text-sm" to="/teacher/timetable">{t('Timetable')}</Link>}>
              <ul className="divide-y text-sm">{d.timetable.map((p: any) => <li key={p.period_no} className="flex justify-between py-2"><span><b>{p.start_time.slice(0, 5)}–{p.end_time.slice(0, 5)}</b> · {p.subject_name}</span><span className="text-slate-500">{p.class_name} – {p.section_name}{p.room ? ` · ${p.room}` : ''}</span></li>)}
                {!d.timetable.length && <li className="py-2 text-slate-500">No periods scheduled today.</li>}</ul>
            </Card>
            <Card title={t('Attendance tasks')}>
              <ul className="space-y-2 text-sm">{d.attendanceTasks.map((x: any) => <li key={x.section_id} className="flex items-center justify-between">{x.class_name} – {x.section_name}
                {x.done ? <Badge tone="green">done</Badge> : <Link className="btn-primary btn-sm" to={`/teacher/attendance?sectionId=${x.section_id}`}>{t('Mark attendance')}</Link>}</li>)}
                {!d.attendanceTasks.length && <li className="text-slate-500">You are not a class teacher. You can still mark attendance for your assigned sections.</li>}</ul>
            </Card>
            <Card title={t('Assigned classes')} className="lg:col-span-2" bodyClass="p-0">
              <table className="min-w-full text-sm"><tbody className="divide-y">{d.assignments.map((a: any) => (
                <tr key={`${a.section_id}-${a.subject_id}`}><td className="td">{a.class_name} – {a.section_name}</td><td className="td">{a.subject_name}</td><td className="td">{a.students} {t('Students').toLowerCase()}</td>
                  <td className="td whitespace-nowrap text-right"><Link className="link mr-3" to={`/teacher/classes?sectionId=${a.section_id}`}>{t('Students')}</Link><Link className="link" to={`/teacher/assignments?sectionId=${a.section_id}&subjectId=${a.subject_id}`}>{t('Assignments')}</Link></td></tr>))}
                {!d.assignments.length && <tr><td className="td text-slate-500">No subjects assigned yet. Contact the Principal.</td></tr>}</tbody></table>
            </Card>
            <Card title={t('Upcoming exams')}>
              <ul className="divide-y text-sm">{d.exams.map((x: any) => <li key={x.id} className="py-2"><p className="flex items-center justify-between font-medium">{x.name} <StatusBadge status={x.status} /></p><p className="text-xs text-slate-500">{fmtDate(x.start_date)} – {fmtDate(x.end_date)}</p>
                {x.status === 'marks_entry' && <Link className="link text-xs" to={`/teacher/marks?examId=${x.id}`}><NotebookPen className="mr-1 inline h-3 w-3" />Enter {x.assessment_mode === 'descriptive' ? 'assessments' : 'marks'}</Link>}</li>)}
                {!d.exams.length && <li className="py-2 text-slate-500">—</li>}</ul>
              {(d.reviewQueue.submissions > 0 || d.reviewQueue.quiz_reviews > 0 || d.reviewQueue.marks_returned > 0) && (
                <div className="mt-3 space-y-1 border-t pt-3 text-sm">
                  {d.reviewQueue.submissions > 0 && <Link className="link block" to="/teacher/assignments">{d.reviewQueue.submissions} assignment submission(s) to review</Link>}
                  {d.reviewQueue.quiz_reviews > 0 && <Link className="link block" to="/teacher/quizzes"><FileQuestion className="mr-1 inline h-3 w-3" />{d.reviewQueue.quiz_reviews} quiz answer(s) to grade</Link>}
                  {d.reviewQueue.marks_returned > 0 && <Link className="link block text-amber-700" to="/teacher/marks">{d.reviewQueue.marks_returned} mark sheet(s) returned by the Principal</Link>}
                </div>
              )}
            </Card>
            <Card title={t('Recent notices')} className="lg:col-span-3" actions={<Link className="link text-sm" to="/teacher/notices">{t('View')}</Link>}>
              <ul className="divide-y text-sm">{d.notices.map((n: any) => <li key={n.id} className="py-2"><p className="font-medium">{pick(n.title, n.title_hi)}</p><p className="text-xs text-slate-500">{fmtDate(n.publish_at)}</p></li>)}{!d.notices.length && <li className="py-2 text-slate-500">—</li>}</ul>
            </Card>
          </div>
        </>
      );
    }}</Async>
  );
}

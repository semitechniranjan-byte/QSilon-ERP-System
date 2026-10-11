import { Link } from 'react-router-dom';
import { CalendarCheck, ClipboardList, FileQuestion, GraduationCap } from 'lucide-react';
import { Async, Card, PageHeader, StatCard, StatusBadge, useApi } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { fmtDate, fmtDateTime, fullName } from '../../lib/format';

export default function StudentDashboard() {
  const { t, pick } = useI18n();
  const q = useApi<any>('/api/me/dashboard');
  return (
    <Async q={q}>{(d) => {
      const e = d.enrollment;
      return (
        <>
          <PageHeader title={<span className="flex items-center gap-3">{d.student.photo_file_id && <img src={`/api/files/${d.student.photo_file_id}`} alt="" className="h-12 w-12 rounded-full object-cover" />}{fullName(d.student)}</span>}
            subtitle={e ? `${pick(e.class_name, e.class_name_hi)} – ${e.section_name} · ${t('Roll No.')} ${e.roll_no} · ${e.year_name} · ${e.board ?? ''} / ${e.medium_name ?? ''}` : 'Not enrolled in the current year.'} />
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label={t('Attendance %')} value={d.attendance?.percent != null ? `${d.attendance.percent}%` : '—'} hint={d.attendance ? `${d.attendance.present} / ${d.attendance.total} days` : undefined} icon={<CalendarCheck className="h-5 w-5" />} tone="green" to="/student/attendance" />
            <StatCard label={t('Latest result')} value={d.latestResult ? `${d.latestResult.percent ?? '—'}%` : '—'} hint={d.latestResult ? `${d.latestResult.examName} · ${d.latestResult.grade ?? ''}` : undefined} icon={<GraduationCap className="h-5 w-5" />} to="/student/results" />
            <StatCard label={t('Homework')} value={d.assignments.length} hint="pending" icon={<ClipboardList className="h-5 w-5" />} tone="amber" to="/student/assignments" />
            <StatCard label={t('Quizzes')} value={d.quizzes.length} hint="open" icon={<FileQuestion className="h-5 w-5" />} tone="purple" to="/student/quizzes" />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title={t('Homework')} className="lg:col-span-2" actions={<Link className="link text-sm" to="/student/assignments">{t('View')}</Link>}>
              <ul className="divide-y text-sm">{d.assignments.map((a: any) => <li key={a.id} className="flex justify-between py-2"><span><b>{a.title}</b> <span className="text-slate-500">· {a.subject_name}</span></span><span className="flex items-center gap-2 text-xs">{t('Due date')}: {fmtDate(a.due_date)} <StatusBadge status={a.status} /></span></li>)}
                {!d.assignments.length && <li className="py-2 text-slate-500">All caught up!</li>}</ul>
            </Card>
            <Card title={t('Upcoming tests')}>
              <ul className="divide-y text-sm">{d.quizzes.map((z: any) => <li key={z.id} className="py-2"><Link className="link" to="/student/quizzes">{z.title}</Link><p className="text-xs text-slate-500">{z.subject_name} · closes {fmtDateTime(z.available_until)}</p></li>)}
                {d.examSchedule.map((x: any, i: number) => <li key={i} className="py-2"><b>{x.subject_name}</b> <span className="text-slate-500">· {x.exam_name}</span><p className="text-xs text-slate-500">{fmtDate(x.exam_date)} {x.start_time?.slice(0, 5) ?? ''} · max {x.max_marks}</p></li>)}
                {!d.quizzes.length && !d.examSchedule.length && <li className="py-2 text-slate-500">—</li>}</ul>
            </Card>
            <Card title={t('Recent notices')} className="lg:col-span-2" actions={<Link className="link text-sm" to="/student/notices">{t('View')}</Link>}>
              <ul className="divide-y text-sm">{d.notices.map((n: any) => <li key={n.id} className="py-2"><p className="font-medium">{pick(n.title, n.title_hi)}</p><p className="text-xs text-slate-500">{fmtDate(n.publish_at)}</p></li>)}{!d.notices.length && <li className="py-2 text-slate-500">—</li>}</ul>
            </Card>
            <Card title={t('Events')}>
              <ul className="divide-y text-sm">{d.events.map((ev: any) => <li key={ev.id} className="py-2"><p className="font-medium">{pick(ev.title, ev.title_hi)}</p><p className="text-xs text-slate-500">{fmtDate(ev.start_date)} · {ev.event_type}</p></li>)}{!d.events.length && <li className="py-2 text-slate-500">—</li>}</ul>
            </Card>
          </div>
        </>
      );
    }}</Async>
  );
}

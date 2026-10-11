import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, BedDouble, Baby, Bus, ClipboardCheck, GraduationCap, IndianRupee, Inbox, Users, Wallet } from 'lucide-react';
import { Async, Card, PageHeader, StatCard, useApi, StatusBadge } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import { fmtDate, fmtDateTime, inr } from '../../lib/format';

export default function AdminDashboard() {
  const { t, pick } = useI18n();
  const { can } = useAuth();
  const q = useApi('/api/dashboard/admin');
  return (
    <>
      <PageHeader title={t('Dashboard')} subtitle={q.data?.year ? `${t('Academic Year')} ${q.data.year.name} · ${fmtDate(q.data.today)}` : undefined}
        actions={<>
          {can('students.manage') && <Link to="/admin/students/new" className="btn-primary">+ {t('Admissions')}</Link>}
          {can('fees.collect') && <Link to="/admin/fees/collect" className="btn-secondary">{t('Collect Fee')}</Link>}
        </>} />
      <Async q={q}>{(d: any) => (
        <div className="space-y-6">
          {!d.year && <div className="card flex items-center gap-3 border-amber-200 bg-amber-50 p-4 text-amber-900"><AlertTriangle className="h-5 w-5" />No current academic year. <Link className="link" to="/admin/settings">Create one in Settings</Link>.</div>}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label={t('Total students')} value={d.counts.students} icon={<GraduationCap className="h-5 w-5" />} to="/admin/students" />
            <StatCard label={t('Active teachers')} value={d.counts.teachers} icon={<Users className="h-5 w-5" />} to="/admin/teachers" tone="green" />
            <StatCard label={t('Preschool enrollment')} value={d.counts.preschool} icon={<Baby className="h-5 w-5" />} tone="amber" />
            <StatCard label={t('Hostel residents')} value={d.counts.hostel} icon={<BedDouble className="h-5 w-5" />} tone="purple" to="/admin/hostel" />
            <StatCard label={t('Day scholars')} value={d.counts.day_scholars} icon={<Users className="h-5 w-5" />} />
            <StatCard label={t('Transport')} value={d.counts.transport} icon={<Bus className="h-5 w-5" />} tone="green" />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title={<span className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4" />{t('Today’s attendance')}</span>} actions={<Link to="/admin/attendance" className="link text-sm">{t('View')}</Link>}>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-lg bg-emerald-50 p-3"><p className="text-2xl font-semibold text-emerald-700">{d.attendance.present}</p><p className="text-xs text-emerald-700">{t('Present')}</p></div>
                <div className="rounded-lg bg-red-50 p-3"><p className="text-2xl font-semibold text-red-700">{d.attendance.absent}</p><p className="text-xs text-red-700">{t('Absent')}</p></div>
                <div className="rounded-lg bg-amber-50 p-3"><p className="text-2xl font-semibold text-amber-700">{d.attendance.half_day}</p><p className="text-xs text-amber-700">{t('Half-day')}</p></div>
                <div className="rounded-lg bg-violet-50 p-3"><p className="text-2xl font-semibold text-violet-700">{d.attendance.leave}</p><p className="text-xs text-violet-700">{t('Leave')}</p></div>
              </div>
              <p className="mt-3 text-sm text-slate-500">{d.attendance.marked} / {d.counts.students} marked · {d.attendance.sections_pending} section(s) pending</p>
            </Card>
            {d.feeSummary ? (
              <Card title={<span className="flex items-center gap-2"><IndianRupee className="h-4 w-4" />{t('Fees')}</span>} actions={<Link to="/admin/fees/reports" className="link text-sm">{t('Reports')}</Link>} className="lg:col-span-2">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div><p className="text-xs uppercase text-slate-500">{t('Collected today')}</p><p className="text-lg font-semibold">{inr(d.feeSummary.today)}</p></div>
                  <div><p className="text-xs uppercase text-slate-500">{t('This month')}</p><p className="text-lg font-semibold">{inr(d.feeSummary.month)}</p></div>
                  <div><p className="text-xs uppercase text-slate-500">{t('Outstanding')}</p><p className="text-lg font-semibold text-amber-700">{inr(d.feeSummary.outstanding)}</p></div>
                  <div><p className="text-xs uppercase text-slate-500">{t('Overdue')}</p><p className="text-lg font-semibold text-red-700">{inr(d.feeSummary.overdue)}</p><p className="text-xs text-slate-500">{d.feeSummary.overdue_students} students</p></div>
                </div>
                {d.collectionTrend.length > 0 && (
                  <div className="mt-4 h-40" aria-label="Collections in the last 30 days">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={d.collectionTrend.map((x: any) => ({ date: x.date.slice(5), amount: x.amount_paise / 100 }))}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} width={60} />
                        <Tooltip formatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`} />
                        <Bar dataKey="amount" fill="#2d6fae" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
            ) : <div className="lg:col-span-2" />}
          </div>
          {d.pending && (d.pending.enquiries + d.pending.corrections + d.pending.password_resets + d.pending.marks_review > 0) && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="New enquiries" value={d.pending.enquiries} icon={<Inbox className="h-5 w-5" />} to="/admin/enquiries" tone="amber" />
              <StatCard label="Profile corrections" value={d.pending.corrections} icon={<Inbox className="h-5 w-5" />} to="/admin/enquiries?tab=corrections" tone="amber" />
              <StatCard label="Password resets" value={d.pending.password_resets} icon={<Inbox className="h-5 w-5" />} to="/admin/users?tab=resets" tone="red" />
              <StatCard label="Marks awaiting review" value={d.pending.marks_review} icon={<Wallet className="h-5 w-5" />} to="/admin/exams" tone="purple" />
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {d.bySection.length > 0 && (
              <Card title={t('Classes & Sections')} bodyClass="p-0">
                <div className="max-h-96 overflow-y-auto">
                  <table className="min-w-full text-sm"><thead className="sticky top-0 bg-slate-50"><tr><th className="th">{t('Class')}</th><th className="th text-right">{t('Students')}</th><th className="th text-right">Boys</th><th className="th text-right">Girls</th></tr></thead>
                    <tbody className="divide-y">{d.bySection.map((s: any) => <tr key={s.class_name + s.section_name}><td className="td">{s.class_name} – {s.section_name} {s.is_preschool && <span className="text-xs text-amber-600">(preschool)</span>}</td><td className="td text-right font-medium">{s.students}</td><td className="td text-right">{s.boys}</td><td className="td text-right">{s.girls}</td></tr>)}</tbody></table>
                </div>
              </Card>
            )}
            <div className="space-y-4">
              <Card title={t('New admissions')}>
                <ul className="divide-y text-sm">{d.newAdmissions.map((s: any) => <li key={s.id} className="flex justify-between py-2"><Link className="link" to={`/admin/students/${s.id}`}>{s.first_name} {s.last_name}</Link><span className="text-slate-500">{s.class_name}-{s.section_name}</span></li>)}
                  {!d.newAdmissions.length && <li className="py-2 text-slate-500">—</li>}</ul>
              </Card>
              <Card title={t('Upcoming exams')}>
                <ul className="divide-y text-sm">{d.upcomingExams.map((x: any) => <li key={x.id} className="flex justify-between py-2"><Link className="link" to={`/admin/exams/${x.id}`}>{x.name}</Link><span className="flex items-center gap-2 text-slate-500">{fmtDate(x.start_date)} <StatusBadge status={x.status} /></span></li>)}
                  {!d.upcomingExams.length && <li className="py-2 text-slate-500">—</li>}</ul>
              </Card>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={t('Recent notices')} actions={<Link to="/admin/notices" className="link text-sm">{t('View')}</Link>}>
              <ul className="divide-y text-sm">{d.notices.map((n: any) => <li key={n.id} className="py-2"><p className="font-medium">{pick(n.title, n.title_hi)}</p><p className="text-xs text-slate-500">{fmtDate(n.publish_at)} · {n.audience}</p></li>)}
                {!d.notices.length && <li className="py-2 text-slate-500">—</li>}</ul>
            </Card>
            {d.activity.length > 0 && (
              <Card title={t('Recent activity')} actions={<Link to="/admin/audit" className="link text-sm">{t('Audit Log')}</Link>}>
                <ul className="divide-y text-sm">{d.activity.map((a: any, i: number) => <li key={i} className="flex justify-between gap-2 py-2"><span><b>{a.display_name ?? 'System'}</b> · {a.action}</span><span className="whitespace-nowrap text-xs text-slate-500">{fmtDateTime(a.at)}</span></li>)}</ul>
              </Card>
            )}
          </div>
        </div>
      )}</Async>
    </>
  );
}

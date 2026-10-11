import { Async, Card, PageHeader, StatusBadge, useApi } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { fmtDate } from '../../lib/format';

export default function StudentAttendance() {
  const { t } = useI18n();
  const { user } = useAuth();
  const q = useApi<any>(`/api/attendance/student/${user?.studentId}`);
  return (
    <>
      <PageHeader title={t('Attendance')} />
      <Async q={q}>{(d) => (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[[t('Attendance %'), d.overall.percent != null ? `${d.overall.percent}%` : '—'], [t('Present'), d.overall.present], [t('Absent'), d.overall.absent], [t('Half-day'), d.overall.half_day], [t('Leave'), d.overall.leave]]
              .map(([k, v]) => <div key={k} className="card p-4"><p className="text-xs uppercase text-slate-500">{k}</p><p className="text-2xl font-semibold">{v}</p></div>)}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Monthly" bodyClass="p-0"><table className="min-w-full text-sm"><thead className="bg-slate-50"><tr><th className="th">Month</th><th className="th">{t('Present')}</th><th className="th">{t('Absent')}</th><th className="th">%</th></tr></thead>
              <tbody className="divide-y">{d.monthly.map((m: any) => <tr key={m.month}><td className="td">{m.month}</td><td className="td">{m.present}/{m.total}</td><td className="td">{m.absent}</td><td className="td font-medium">{m.percent ?? '—'}</td></tr>)}</tbody></table></Card>
            <Card title="Daily record" className="lg:col-span-2" bodyClass="p-0"><div className="max-h-[32rem] overflow-y-auto"><table className="min-w-full text-sm"><tbody className="divide-y">{d.records.map((r: any) => <tr key={`${r.date}${r.session}`}><td className="td">{fmtDate(r.date)}</td><td className="td"><StatusBadge status={r.status} /></td><td className="td text-xs text-slate-500">{r.remarks}</td></tr>)}
              {!d.records.length && <tr><td className="td text-slate-500">No attendance recorded yet.</td></tr>}</tbody></table></div></Card>
          </div>
          <p className="text-xs text-slate-500">Approved leave is not counted against your attendance percentage. Contact your class teacher if a record looks wrong.</p>
        </div>
      )}</Async>
    </>
  );
}

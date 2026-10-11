import { useState } from 'react';
import { Async, Card, PageHeader, useApi } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { DAYS } from '../admin/TimetableAdmin';

export default function TimetableView() {
  const { t, pick } = useI18n();
  const { user } = useAuth();
  const [sectionId, setSectionId] = useState('');
  const sections = useApi<any[]>(user?.role === 'teacher' ? '/api/academics/sections' : null);
  const q = useApi<any[]>(`/api/academics/timetable${sectionId ? `?sectionId=${sectionId}` : ''}`);
  const periods = useApi<any[]>('/api/academics/periods');
  return (
    <>
      <PageHeader title={t('Timetable')} actions={<>
        {user?.role === 'teacher' && <select className="input w-56" value={sectionId} onChange={(e) => setSectionId(e.target.value)}><option value="">My timetable</option>{sections.data?.map((s) => <option key={s.id} value={s.id}>{s.class_name} – {s.name}</option>)}</select>}
        <button className="btn-secondary" onClick={() => window.print()}>{t('Print')}</button></>} />
      <Card bodyClass="p-0">
        <Async q={q}>{(rows) => (periods.data?.length ? (
          <div className="overflow-x-auto"><table className="min-w-full text-sm">
            <thead className="bg-slate-50"><tr><th className="th">Period</th>{DAYS.map((d) => <th key={d} className="th">{d}</th>)}</tr></thead>
            <tbody className="divide-y">{periods.data.map((p) => (
              <tr key={p.id}><td className="td whitespace-nowrap"><b>{p.label || `#${p.period_no}`}</b><br /><span className="text-xs text-slate-500">{p.start_time.slice(0, 5)}–{p.end_time.slice(0, 5)}</span></td>
                {DAYS.map((_, di) => { const e = rows.find((r) => r.day_of_week === di + 1 && r.period_id === p.id); return (
                  <td key={di} className="td">{p.is_break ? <span className="text-xs text-slate-400">Break</span> : e ? <div><p className="font-medium">{pick(e.subject_name, e.subject_name_hi)}</p><p className="text-xs text-slate-500">{user?.role === 'teacher' && !sectionId ? `${e.class_name}-${e.section_name}` : e.teacher_name}</p></div> : <span className="text-slate-300">—</span>}</td>); })}</tr>))}</tbody>
          </table></div>
        ) : <p className="p-4 text-sm text-slate-500">The timetable has not been published yet.</p>)}</Async>
      </Card>
    </>
  );
}

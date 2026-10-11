import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Async, Card, Modal, PageHeader, StatusBadge, useApi } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { fullName, todayISO } from '../../lib/format';

export default function AttendanceOverview() {
  const { t } = useI18n();
  const [date, setDate] = useState(todayISO());
  const q = useApi<any[]>(`/api/attendance/daily?date=${date}`);
  const [sel, setSel] = useState<any>(null);
  const abs = useApi<any[]>(sel ? `/api/attendance/daily/${sel.section_id}/absentees?date=${date}` : null);
  return (
    <>
      <PageHeader title={t('Attendance')} subtitle="Class-wise attendance for the selected day." actions={<><input type="date" className="input w-44" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} aria-label={t('Date')} />
        <Link to="/admin/attendance/mark" className="btn-primary">{t('Mark attendance')}</Link></>} />
      <Async q={q}>{(rows) => {
        const tot = rows.reduce((a, r) => ({ enrolled: a.enrolled + r.enrolled, marked: a.marked + r.marked, present: a.present + r.present, absent: a.absent + r.absent }), { enrolled: 0, marked: 0, present: 0, absent: 0 });
        return (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[['Enrolled', tot.enrolled], ['Marked', tot.marked], [t('Present'), tot.present], [t('Absent'), tot.absent]].map(([k, v]) => <div key={k} className="card p-4"><p className="text-xs uppercase text-slate-500">{k}</p><p className="text-2xl font-semibold">{v}</p></div>)}
            </div>
            <Card bodyClass="p-0">
              <table className="min-w-full text-sm"><thead className="bg-slate-50"><tr>{[t('Class'), 'Enrolled', 'Marked', t('Present'), t('Absent'), t('Half-day'), t('Leave'), '%', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                <tbody className="divide-y">{rows.map((r) => (
                  <tr key={r.section_id}><td className="td font-medium">{r.class_name} – {r.section_name}</td><td className="td">{r.enrolled}</td>
                    <td className="td">{r.marked === 0 ? <StatusBadge status="pending" /> : r.marked}</td><td className="td">{r.present}</td><td className="td text-red-600">{r.absent}</td><td className="td">{r.half_day}</td><td className="td">{r.leave}</td>
                    <td className="td">{r.marked ? Math.round((100 * r.present) / r.marked) : '—'}</td>
                    <td className="td whitespace-nowrap"><button className="link mr-3" onClick={() => setSel(r)}>Absentees</button><Link className="link" to={`/admin/attendance/mark?sectionId=${r.section_id}`}>Open</Link></td></tr>))}</tbody></table>
            </Card>
          </>
        );
      }}</Async>
      <Modal open={!!sel} onClose={() => setSel(null)} title={`${sel?.class_name} – ${sel?.section_name}: not present`}>
        <Async q={abs}>{(rows) => <ul className="divide-y text-sm">{rows.map((r) => <li key={r.id} className="flex justify-between py-2"><span>{r.roll_no}. {fullName(r)}</span><StatusBadge status={r.status} /></li>)}{!rows.length && <li className="py-2 text-slate-500">Everyone marked present.</li>}</ul>}</Async>
      </Modal>
    </>
  );
}

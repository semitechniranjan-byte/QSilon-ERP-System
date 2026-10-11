import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Card, PageHeader, Tabs, useAction, useApi } from '../../components/ui';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useLookups } from '../../lib/lookups';

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function TimetableAdmin() {
  const { t } = useI18n();
  const [tab, setTab] = useState<'grid' | 'periods'>('grid');
  return (
    <>
      <PageHeader title={t('Timetable')} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'grid', label: 'Section timetable' }, { key: 'periods', label: 'Periods / bell schedule' }]} />
      {tab === 'grid' ? <Grid /> : <Periods />}
    </>
  );
}

function Periods() {
  const { current } = useLookups();
  const q = useApi<any[]>('/api/academics/periods');
  const [rows, setRows] = useState<any[]>([]);
  const { run, busy } = useAction();
  useEffect(() => { if (q.data) setRows(q.data.map((p) => ({ periodNo: p.period_no, label: p.label ?? '', startTime: p.start_time.slice(0, 5), endTime: p.end_time.slice(0, 5), isBreak: p.is_break }))); }, [q.data]);
  return (
    <Card actions={<button className="btn-primary" disabled={busy || !current} onClick={() => run(() => api.put('/api/academics/periods', { academicYearId: current!.id, periods: rows }))}>Save</button>}>
      <div className="space-y-2">{rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-sm font-medium">#{r.periodNo}</span>
          <input className="input w-32" type="time" value={r.startTime} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, startTime: e.target.value } : x)))} aria-label="Start" />
          <input className="input w-32" type="time" value={r.endTime} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, endTime: e.target.value } : x)))} aria-label="End" />
          <input className="input w-40" placeholder="Label" value={r.label} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={r.isBreak} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, isBreak: e.target.checked } : x)))} />Break</label>
          <button className="btn-ghost btn-sm text-red-600" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
        </div>))}
        <button className="btn-secondary btn-sm" onClick={() => { const last = rows.at(-1); setRows([...rows, { periodNo: (last?.periodNo ?? 0) + 1, label: '', startTime: last?.endTime ?? '08:00', endTime: last?.endTime ?? '08:40', isBreak: false }]); }}><Plus className="h-4 w-4" />Period</button>
      </div>
    </Card>
  );
}

function Grid() {
  const { current, sectionsFor, sectionLabel } = useLookups();
  const [sectionId, setSectionId] = useState('');
  const periods = useApi<any[]>('/api/academics/periods');
  const entries = useApi<any[]>(sectionId ? `/api/academics/timetable?sectionId=${sectionId}` : null);
  const assignments = useApi<any[]>('/api/academics/assignments');
  const [cells, setCells] = useState<Record<string, { subjectId: number; teacherId: number } | null>>({});
  const { run, busy } = useAction();
  useEffect(() => { if (entries.data) setCells(Object.fromEntries(entries.data.map((e) => [`${e.day_of_week}:${e.period_id}`, { subjectId: e.subject_id, teacherId: e.teacher_id }]))); }, [entries.data]);
  const options = (assignments.data ?? []).filter((a) => String(a.section_id) === sectionId);
  return (
    <Card title={<select className="input" value={sectionId} onChange={(e) => setSectionId(e.target.value)} aria-label="Section"><option value="">Choose section…</option>{sectionsFor(current?.id).map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}</select>}
      actions={sectionId && <button className="btn-primary" disabled={busy} onClick={() => run(() => api.put(`/api/academics/timetable/${sectionId}`, { entries: Object.entries(cells).filter(([, v]) => v).map(([k, v]) => { const [d, p] = k.split(':').map(Number); return { dayOfWeek: d, periodId: p, subjectId: v!.subjectId, teacherId: v!.teacherId }; }) }))}>Save</button>} bodyClass="p-0">
      {!sectionId ? <p className="p-4 text-sm text-slate-500">Choose a section. Options come from the section's subject–teacher assignments; teacher double-booking is prevented.</p> :
        !periods.data?.length ? <p className="p-4 text-sm text-amber-700">Define periods first.</p> : (
          <div className="overflow-x-auto"><table className="min-w-full text-sm">
            <thead className="bg-slate-50"><tr><th className="th">Period</th>{DAYS.map((d) => <th key={d} className="th">{d}</th>)}</tr></thead>
            <tbody className="divide-y">{periods.data.map((p) => (
              <tr key={p.id}><td className="td whitespace-nowrap"><b>{p.label || `#${p.period_no}`}</b><br /><span className="text-xs text-slate-500">{p.start_time.slice(0, 5)}–{p.end_time.slice(0, 5)}</span></td>
                {DAYS.map((_, di) => { const k = `${di + 1}:${p.id}`; const v = cells[k]; return (
                  <td key={k} className="td">{p.is_break ? <span className="text-xs text-slate-400">Break</span> : (
                    <select className="input min-w-[9rem] text-xs" value={v ? `${v.subjectId}:${v.teacherId}` : ''} onChange={(e) => { const [s, tt] = e.target.value.split(':').map(Number); setCells({ ...cells, [k]: e.target.value ? { subjectId: s, teacherId: tt } : null }); }}>
                      <option value="">—</option>{options.map((o) => <option key={o.id} value={`${o.subject_id}:${o.teacher_id}`}>{o.subject_name} · {o.teacher_name}</option>)}
                    </select>)}</td>); })}
              </tr>))}</tbody>
          </table></div>
        )}
    </Card>
  );
}

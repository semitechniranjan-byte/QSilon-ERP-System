import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Async, Card, Field, PageHeader, Tabs, useAction, useApi, useUi } from '../../components/ui';
import { api, qs } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { fullName, todayISO } from '../../lib/format';

const STATUSES = [
  { k: 'present', label: 'Present', short: 'P', cls: 'bg-emerald-600 text-white' }, { k: 'absent', label: 'Absent', short: 'A', cls: 'bg-red-600 text-white' },
  { k: 'late', label: 'Late', short: 'L', cls: 'bg-amber-500 text-white' }, { k: 'half_day', label: 'Half-day', short: 'H', cls: 'bg-orange-500 text-white' },
  { k: 'leave', label: 'Leave', short: 'LV', cls: 'bg-violet-600 text-white' },
];

export function useMySections() {
  return useApi<any[]>('/api/academics/sections');
}

export default function AttendanceMark() {
  const { t } = useI18n();
  const [sp, setSp] = useSearchParams();
  const sections = useMySections();
  const sectionId = sp.get('sectionId') ?? '';
  const [tab, setTab] = useState<'mark' | 'report' | 'month'>('mark');
  useEffect(() => { if (!sectionId && sections.data?.length) setSp({ sectionId: String(sections.data[0].id) }, { replace: true }); }, [sections.data, sectionId, setSp]);
  return (
    <>
      <PageHeader title={t('Attendance')} actions={
        <select className="input w-56" value={sectionId} onChange={(e) => setSp({ sectionId: e.target.value })} aria-label={t('Section')}>
          {sections.data?.map((s) => <option key={s.id} value={s.id}>{s.class_name} – {s.name}</option>)}
        </select>} />
      {sections.data && !sections.data.length && <Card><p className="text-sm text-slate-500">You are not assigned to any class yet.</p></Card>}
      {sectionId && <>
        <Tabs value={tab} onChange={setTab} tabs={[{ key: 'mark', label: t('Mark attendance') }, { key: 'report', label: 'Summary & %' }, { key: 'month', label: 'Monthly register' }]} />
        {tab === 'mark' && <MarkSheet sectionId={sectionId} />}
        {tab === 'report' && <Summary sectionId={sectionId} />}
        {tab === 'month' && <Monthly sectionId={sectionId} />}
      </>}
    </>
  );
}

function MarkSheet({ sectionId }: { sectionId: string }) {
  const { t } = useI18n();
  const [date, setDate] = useState(todayISO());
  const q = useApi<any>(`/api/attendance/sheet?sectionId=${sectionId}&date=${date}`);
  const [vals, setVals] = useState<Record<number, { status: string; remarks: string }>>({});
  const [reason, setReason] = useState('');
  const { run, busy } = useAction();
  const { toast } = useUi();
  useEffect(() => { if (q.data) setVals(Object.fromEntries(q.data.students.map((s: any) => [s.student_id, { status: s.status ?? 'present', remarks: s.remarks ?? '' }]))); }, [q.data]);
  const counts = STATUSES.map((s) => [s.label, Object.values(vals).filter((v) => v.status === s.k).length] as const);
  return (
    <Card title={<div className="flex flex-wrap items-center gap-2"><input type="date" className="input w-44" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} aria-label={t('Date')} />
      {q.data?.alreadyMarked && <span className="text-xs font-normal text-emerald-700">Already marked — changes are recorded as corrections.</span>}</div>}
      actions={q.data?.canEdit && <>
        <button className="btn-secondary btn-sm" onClick={() => setVals(Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, { ...v, status: 'present' }])))}>All present</button>
        <button className="btn-primary" disabled={busy} onClick={async () => {
          const r = await run(() => api.post('/api/attendance/sheet', { sectionId: Number(sectionId), date, entries: Object.entries(vals).map(([k, v]) => ({ studentId: Number(k), status: v.status, remarks: v.remarks || null })), correctionReason: reason || null }), { success: false });
          if (r) { toast('success', `Attendance saved: ${r.created} new, ${r.changed} corrected.`); setReason(''); }
        }}>{t('Save')}</button></>} bodyClass="p-0">
      <Async q={q}>{(d) => (
        <>
          {!d.canEdit && <p className="m-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{d.reason}</p>}
          <div className="flex flex-wrap gap-3 border-b px-4 py-2 text-xs text-slate-600">{counts.map(([l, n]) => <span key={l}>{t(l)}: <b>{n}</b></span>)}</div>
          <div className="divide-y">{d.students.map((s: any) => { const v = vals[s.student_id] ?? { status: 'present', remarks: '' }; return (
            <div key={s.student_id} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3"><span className="w-8 text-right text-sm text-slate-500">{s.roll_no}</span><span className="truncate font-medium">{fullName(s)}</span>{s.marked_by_name && <span className="hidden text-xs text-slate-400 md:inline">by {s.marked_by_name}</span>}</div>
              <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label={`${fullName(s)} attendance`}>
                {STATUSES.map((o) => (
                  <button key={o.k} role="radio" aria-checked={v.status === o.k} title={t(o.label)} disabled={!d.canEdit}
                    className={`min-w-[2.5rem] rounded-md px-2 py-1.5 text-xs font-semibold ${v.status === o.k ? o.cls : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    onClick={() => setVals({ ...vals, [s.student_id]: { ...v, status: o.k } })}>{o.short}</button>))}
                <input className="input ml-1 w-40 py-1 text-xs" placeholder={t('Remarks')} value={v.remarks} disabled={!d.canEdit} onChange={(e) => setVals({ ...vals, [s.student_id]: { ...v, remarks: e.target.value } })} />
              </div>
            </div>); })}</div>
          {d.alreadyMarked && d.canEdit && <div className="border-t p-4"><Field label="Correction reason (for the audit trail)"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>}
          <p className="px-4 py-3 text-xs text-slate-500">P = {t('Present')}, A = {t('Absent')}, L = {t('Late')}, H = {t('Half-day')}, LV = approved {t('Leave')}</p>
        </>
      )}</Async>
    </Card>
  );
}

function Summary({ sectionId }: { sectionId: string }) {
  const { t } = useI18n();
  const [range, setRange] = useState({ from: '', to: '' });
  const q = useApi<any[]>(`/api/attendance/summary${qs({ sectionId, ...range })}`);
  return (
    <Card title={<div className="flex flex-wrap gap-2"><input type="date" className="input w-40" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} aria-label="From" /><input type="date" className="input w-40" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} aria-label="To" /></div>}
      actions={<a className="btn-secondary btn-sm" href={`/api/reports/attendance${qs({ format: 'xlsx', sectionId, ...range })}`}><Download className="h-4 w-4" />{t('Export Excel')}</a>} bodyClass="p-0">
      <Async q={q}>{(rows) => (
        <div className="overflow-x-auto"><table className="min-w-full text-sm">
          <thead className="bg-slate-50"><tr>{[t('Roll No.'), t('Name'), 'Days', t('Present'), t('Late'), t('Half-day'), t('Absent'), t('Leave'), '%'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody className="divide-y">{rows.map((r) => (
            <tr key={r.student_id}><td className="td">{r.roll_no}</td><td className="td">{fullName(r)}</td><td className="td">{r.total}</td><td className="td">{r.present}</td><td className="td">{r.late}</td><td className="td">{r.half_day}</td><td className="td">{r.absent}</td><td className="td">{r.leave}</td>
              <td className={`td font-semibold ${r.percent != null && r.percent < 75 ? 'text-red-600' : ''}`}>{r.percent ?? '—'}</td></tr>))}</tbody>
        </table></div>
      )}</Async>
    </Card>
  );
}

function Monthly({ sectionId }: { sectionId: string }) {
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const q = useApi<any>(`/api/attendance/monthly?sectionId=${sectionId}&month=${month}`);
  const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const short: Record<string, string> = { present: 'P', absent: 'A', late: 'L', half_day: 'H', leave: 'LV' };
  const color: Record<string, string> = { present: 'text-emerald-700', absent: 'text-red-600 font-bold', late: 'text-amber-600', half_day: 'text-orange-600', leave: 'text-violet-600' };
  return (
    <Card title={<input type="month" className="input w-44" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month" />} actions={<button className="btn-secondary btn-sm" onClick={() => window.print()}>Print</button>} bodyClass="p-0">
      <Async q={q}>{(d) => (
        <div className="overflow-x-auto"><table className="min-w-full text-xs">
          <thead className="bg-slate-50"><tr><th className="th">#</th><th className="th">Name</th>{Array.from({ length: days }, (_, i) => <th key={i} className="px-1 py-2 text-center font-medium text-slate-500">{i + 1}</th>)}</tr></thead>
          <tbody className="divide-y">{d.students.map((s: any) => (
            <tr key={s.student_id}><td className="px-2 py-1.5">{s.roll_no}</td><td className="whitespace-nowrap px-2 py-1.5">{fullName(s)}</td>
              {Array.from({ length: days }, (_, i) => { const r = d.records.find((x: any) => x.student_id === s.student_id && x.day === i + 1); return <td key={i} className={`px-1 text-center ${r ? color[r.status] : 'text-slate-300'}`}>{r ? short[r.status] : '·'}</td>; })}</tr>))}</tbody>
        </table></div>
      )}</Async>
    </Card>
  );
}

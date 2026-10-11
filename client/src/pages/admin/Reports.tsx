import { useState } from 'react';
import { Download } from 'lucide-react';
import { Card, Field, PageHeader, useApi } from '../../components/ui';
import { qs } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useLookups } from '../../lib/lookups';
import { todayISO } from '../../lib/format';

export default function Reports() {
  const { t } = useI18n();
  const { lk, current, sectionsFor, sectionLabel } = useLookups();
  const [p, setP] = useState({ yearId: '', sectionId: '', from: todayISO().slice(0, 8) + '01', to: todayISO(), examId: '' });
  const y = p.yearId ? Number(p.yearId) : current?.id;
  const exams = useApi<any[]>(y ? `/api/exams?yearId=${y}` : null);
  const reports: { key: string; title: string; desc: string; params: string[] }[] = [
    { key: 'students', title: 'Student list', desc: 'All enrolled students with class, roll, board, medium, residency, transport and guardian contact.', params: ['yearId', 'sectionId'] },
    { key: 'teachers', title: 'Teacher list', desc: 'Teachers with qualifications and current subject allocations.', params: ['yearId'] },
    { key: 'attendance', title: 'Attendance report', desc: 'Section attendance with day counts and percentage for a date range.', params: ['sectionId', 'from', 'to'] },
    { key: 'collections', title: 'Fee collections', desc: 'Every payment in the date range with receipt numbers and modes.', params: ['from', 'to'] },
    { key: 'outstanding', title: 'Outstanding fees', desc: 'Students with dues and overdue amounts.', params: ['yearId', 'sectionId'] },
    { key: 'hostel-occupancy', title: 'Hostel occupancy', desc: 'All beds with current residents.', params: [] },
    { key: 'exam-results', title: 'Examination results', desc: 'Subject-wise marks, totals, grades and ranks for a section.', params: ['examId', 'sectionId'] },
  ];
  const link = (key: string, params: string[], format: string) => `/api/reports/${key}${qs({ format, ...Object.fromEntries(params.map((k) => [k, (p as any)[k]])) })}`;
  return (
    <>
      <PageHeader title={t('Reports')} subtitle="Download reports as Excel or CSV. Exports are recorded in the audit log." />
      <Card className="mb-4"><div className="grid gap-3 md:grid-cols-5">
        <Field label={t('Academic Year')}><select className="input" value={p.yearId} onChange={(e) => setP({ ...p, yearId: e.target.value, sectionId: '', examId: '' })}><option value="">{current?.name}</option>{lk?.years.filter((x) => !x.is_current).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <Field label={t('Section')}><select className="input" value={p.sectionId} onChange={(e) => setP({ ...p, sectionId: e.target.value })}><option value="">{t('All')}</option>{sectionsFor(y).map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}</select></Field>
        <Field label="From"><input type="date" className="input" value={p.from} onChange={(e) => setP({ ...p, from: e.target.value })} /></Field>
        <Field label="To"><input type="date" className="input" value={p.to} onChange={(e) => setP({ ...p, to: e.target.value })} /></Field>
        <Field label={t('Exams')}><select className="input" value={p.examId} onChange={(e) => setP({ ...p, examId: e.target.value })}><option value="">—</option>{exams.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
      </div></Card>
      <div className="grid gap-4 md:grid-cols-2">{reports.map((r) => (
        <Card key={r.key} title={r.title}>
          <p className="mb-3 text-sm text-slate-600">{r.desc}</p>
          <p className="mb-3 text-xs text-slate-400">Uses: {r.params.join(', ') || 'no filters'}</p>
          <div className="flex gap-2"><a className="btn-primary btn-sm" href={link(r.key, r.params, 'xlsx')}><Download className="h-4 w-4" />Excel</a><a className="btn-secondary btn-sm" href={link(r.key, r.params, 'csv')}>CSV</a></div>
        </Card>))}</div>
    </>
  );
}

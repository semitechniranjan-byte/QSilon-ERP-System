import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Async, Card, Field, Modal, PageHeader, StatusBadge, useAction, useApi } from '../../components/ui';
import { DataTable } from '../../components/DataTable';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useLookups } from '../../lib/lookups';
import { fmtDate } from '../../lib/format';

export function ExamFields({ v, set, errors }: { v: any; set: (v: any) => void; errors: Record<string, string[]> }) {
  const { lk } = useLookups();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Name" required error={errors.name}><input className="input" value={v.name} onChange={(e) => set({ ...v, name: e.target.value })} placeholder="Half Yearly Examination" /></Field>
      <Field label="Type"><select className="input" value={v.examType} onChange={(e) => set({ ...v, examType: e.target.value, assessmentMode: e.target.value === 'preschool_assessment' ? 'descriptive' : v.assessmentMode })}>
        {[['unit', 'Unit test'], ['term', 'Term exam'], ['half_yearly', 'Half yearly'], ['final', 'Final / Annual'], ['preschool_assessment', 'Preschool assessment'], ['other', 'Other']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Assessment mode" hint="Descriptive = preschool development ratings instead of marks."><select className="input" value={v.assessmentMode} disabled={v.examType === 'preschool_assessment'} onChange={(e) => set({ ...v, assessmentMode: e.target.value })}><option value="marks">Marks</option><option value="descriptive">Descriptive (preschool)</option></select></Field>
      <Field label="Term"><select className="input" value={v.termId ?? ''} onChange={(e) => set({ ...v, termId: e.target.value })}><option value="">—</option>{lk?.terms.filter((tt) => tt.academic_year_id === v.academicYearId).map((tt) => <option key={tt.id} value={tt.id}>{tt.name}</option>)}</select></Field>
      <Field label="Grading scale"><select className="input" value={v.gradingScaleId ?? ''} onChange={(e) => set({ ...v, gradingScaleId: e.target.value })}><option value="">Default</option>{lk?.scales.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <Field label="Overall pass %" error={errors.passPercent}><input className="input" type="number" min={0} max={100} value={v.passPercent} onChange={(e) => set({ ...v, passPercent: e.target.value })} /></Field>
      <Field label="Start date"><input className="input" type="date" value={v.startDate ?? ''} onChange={(e) => set({ ...v, startDate: e.target.value })} /></Field>
      <Field label="End date"><input className="input" type="date" value={v.endDate ?? ''} onChange={(e) => set({ ...v, endDate: e.target.value })} /></Field>
    </div>
  );
}

export default function Exams() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { lk, current } = useLookups();
  const [yearId, setYearId] = useState<number | null>(null);
  const y = yearId ?? current?.id;
  const q = useApi<any[]>(y ? `/api/exams?yearId=${y}` : null);
  const [v, setV] = useState<any>(null);
  const { run, busy, fieldErrors } = useAction();
  return (
    <>
      <PageHeader title={t('Examinations')} actions={<>
        <select className="input w-32" value={y ?? ''} onChange={(e) => setYearId(Number(e.target.value))}>{lk?.years.map((yy) => <option key={yy.id} value={yy.id}>{yy.name}</option>)}</select>
        <button className="btn-primary" onClick={() => setV({ academicYearId: y, name: '', examType: 'term', assessmentMode: 'marks', passPercent: 33, termId: '', gradingScaleId: '', startDate: '', endDate: '' })}><Plus className="h-4 w-4" />Exam</button></>} />
      <Card bodyClass="p-0">
        <Async q={q}>{(rows) => (
          <DataTable rows={rows} onRowClick={(r) => nav(`/admin/exams/${r.id}`)} columns={[
            { key: 'name', header: t('Name'), render: (r) => <span className="font-medium">{r.name}</span> },
            { key: 'exam_type', header: 'Type', render: (r) => r.exam_type.replace('_', ' ') }, { key: 'assessment_mode', header: 'Mode' },
            { key: 'start_date', header: 'Dates', render: (r) => `${fmtDate(r.start_date)} – ${fmtDate(r.end_date)}` },
            { key: 'subject_count', header: t('Subjects'), className: 'text-right' },
            { key: 'pending_review', header: 'Awaiting review', className: 'text-right', render: (r) => r.pending_review > 0 ? <span className="font-semibold text-amber-700">{r.pending_review}</span> : 0 },
            { key: 'status', header: t('Status'), render: (r) => <StatusBadge status={r.status} /> },
          ]} />
        )}</Async>
      </Card>
      {v && (
        <Modal open onClose={() => setV(null)} title="New examination" size="lg" footer={<><button className="btn-secondary" onClick={() => setV(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={async () => { const r = await run(() => api.post('/api/exams', { ...v, termId: v.termId || null, gradingScaleId: v.gradingScaleId || null })); if (r) nav(`/admin/exams/${r.id}`); }}>Create</button></>}>
          <ExamFields v={v} set={setV} errors={fieldErrors} />
        </Modal>
      )}
    </>
  );
}

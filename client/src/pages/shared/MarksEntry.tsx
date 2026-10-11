import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Async, Card, Field, PageHeader, StatusBadge, useAction, useApi, useUi } from '../../components/ui';
import { api, qs } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { fullName } from '../../lib/format';

export default function MarksEntry() {
  const { t } = useI18n();
  const { id: routeExamId } = useParams();
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const examId = routeExamId ?? sp.get('examId') ?? '';
  const sectionId = sp.get('sectionId') ?? '';
  const subjectId = sp.get('subjectId') ?? '';
  const exams = useApi<any[]>(user?.role === 'teacher' ? '/api/exams' : null);
  const exam = useApi<any>(examId ? `/api/exams/${examId}` : null);
  const assignments = useApi<any[]>('/api/academics/assignments');
  const sections = useApi<any[]>('/api/academics/sections');
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); if (k === 'examId') { n.delete('sectionId'); n.delete('subjectId'); } setSp(n); };
  const descriptive = exam.data?.assessment_mode === 'descriptive';
  const mine = (assignments.data ?? []).filter((a) => !exam.data || exam.data.subjects.some((s: any) => s.class_level_id === a.class_level_id && s.subject_id === a.subject_id));
  return (
    <>
      <PageHeader title={t('Marks Entry')} back={routeExamId ? `/admin/exams/${routeExamId}` : undefined} subtitle={exam.data ? `${exam.data.name} · ${exam.data.status.replace('_', ' ')}` : 'Choose an examination and class.'} />
      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-2">
          {!routeExamId && (
            <Field label={t('Examinations')}><select className="input" value={examId} onChange={(e) => set('examId', e.target.value)}>
              <option value="">—</option>{exams.data?.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.status.replace('_', ' ')})</option>)}</select></Field>
          )}
          {examId && !descriptive && (
            <Field label={`${t('Class')} & ${t('Subject')}`}><select className="input" value={sectionId && subjectId ? `${sectionId}:${subjectId}` : ''} onChange={(e) => { const [a, b] = e.target.value.split(':'); const n = new URLSearchParams(sp); n.set('sectionId', a); n.set('subjectId', b); setSp(n); }}>
              <option value="">—</option>{mine.map((a) => <option key={a.id} value={`${a.section_id}:${a.subject_id}`}>{a.class_name} – {a.section_name} · {a.subject_name}{user?.role !== 'teacher' ? ` (${a.teacher_name})` : ''}</option>)}</select></Field>
          )}
          {examId && descriptive && (
            <Field label={t('Section')}><select className="input" value={sectionId} onChange={(e) => set('sectionId', e.target.value)}>
              <option value="">—</option>{sections.data?.filter((s) => s.is_preschool).map((s) => <option key={s.id} value={s.id}>{s.class_name} – {s.name}</option>)}</select></Field>
          )}
        </div>
      </Card>
      {examId && sectionId && !descriptive && subjectId && <MarksSheet examId={examId} sectionId={sectionId} subjectId={subjectId} />}
      {examId && sectionId && descriptive && <DescriptiveSheet examId={examId} sectionId={sectionId} />}
    </>
  );
}

function MarksSheet({ examId, sectionId, subjectId }: { examId: string; sectionId: string; subjectId: string }) {
  const { t } = useI18n();
  const q = useApi<any>(`/api/exams/marks/sheet${qs({ examId, sectionId, subjectId })}`);
  const [vals, setVals] = useState<Record<number, { marks: string; isAbsent: boolean; remarks: string }>>({});
  const { run, busy } = useAction();
  const { confirm } = useUi();
  useEffect(() => { if (q.data) setVals(Object.fromEntries(q.data.students.map((s: any) => [s.student_id, { marks: s.marks_obtained ?? '', isAbsent: s.is_absent ?? false, remarks: s.remarks ?? '' }]))); }, [q.data]);
  const save = () => run(() => api.put('/api/exams/marks/sheet', { examId: Number(examId), sectionId: Number(sectionId), subjectId: Number(subjectId),
    entries: Object.entries(vals).map(([k, v]) => ({ studentId: Number(k), marks: v.isAbsent || v.marks === '' ? null : Number(v.marks), isAbsent: v.isAbsent, remarks: v.remarks || null })) }), { success: 'Draft saved.' });
  return (
    <Async q={q}>{(d) => {
      const max = d.examSubject.max_marks;
      const filled = Object.values(vals).filter((v) => v.isAbsent || v.marks !== '').length;
      return (
        <Card title={<span className="flex items-center gap-2">Max {max} · Pass {d.examSubject.pass_marks} <StatusBadge status={d.status} /></span>}
          actions={d.editable && <>
            <button className="btn-secondary" disabled={busy} onClick={save}>Save draft</button>
            <button className="btn-primary" disabled={busy || filled < d.students.length} onClick={async () => {
              if (!(await confirm({ title: 'Submit for review', message: 'Marks will be locked and sent to the Principal for approval.' }))) return;
              if (await save()) await run(() => api.post('/api/exams/marks/submit', { examId: Number(examId), sectionId: Number(sectionId), subjectId: Number(subjectId) }), { success: 'Submitted for review.' });
            }}>{t('Submit')} ({filled}/{d.students.length})</button></>} bodyClass="p-0">
          {d.submission?.review_note && d.status === 'returned' && <p className="m-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Returned by Principal: {d.submission.review_note}</p>}
          {!d.editable && <p className="m-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{d.exam.status !== 'marks_entry' ? 'Marks entry is not open for this exam.' : 'These marks are locked (submitted or approved).'}</p>}
          <div className="overflow-x-auto"><table className="min-w-full text-sm">
            <thead className="bg-slate-50"><tr><th className="th">{t('Roll No.')}</th><th className="th">{t('Name')}</th><th className="th">{t('Marks')} / {max}</th><th className="th">{t('Absent')}</th><th className="th">{t('Remarks')}</th></tr></thead>
            <tbody className="divide-y">{d.students.map((s: any) => { const v = vals[s.student_id] ?? { marks: '', isAbsent: false, remarks: '' }; const bad = v.marks !== '' && (Number(v.marks) > max || Number(v.marks) < 0);
              return (
                <tr key={s.student_id}><td className="td">{s.roll_no}</td><td className="td">{fullName(s)}</td>
                  <td className="td"><input className={`input w-24 ${bad ? 'border-red-500' : ''}`} type="number" min={0} max={max} step="0.01" inputMode="decimal" disabled={!d.editable || v.isAbsent} value={v.marks}
                    onChange={(e) => setVals({ ...vals, [s.student_id]: { ...v, marks: e.target.value } })} aria-label={`Marks for ${fullName(s)}`} aria-invalid={bad} />
                    {v.marks !== '' && Number(v.marks) < d.examSubject.pass_marks && !bad && <span className="ml-2 text-xs text-red-600">below pass</span>}</td>
                  <td className="td"><input type="checkbox" disabled={!d.editable} checked={v.isAbsent} onChange={(e) => setVals({ ...vals, [s.student_id]: { ...v, isAbsent: e.target.checked, marks: e.target.checked ? '' : v.marks } })} aria-label="Absent" /></td>
                  <td className="td"><input className="input" disabled={!d.editable} value={v.remarks} onChange={(e) => setVals({ ...vals, [s.student_id]: { ...v, remarks: e.target.value } })} /></td></tr>);
            })}</tbody></table></div>
        </Card>
      );
    }}</Async>
  );
}

const RATINGS = ['beginning', 'developing', 'proficient', 'excellent'];
function DescriptiveSheet({ examId, sectionId }: { examId: string; sectionId: string }) {
  const { t, pick } = useI18n();
  const q = useApi<any>(`/api/exams/assessment/sheet${qs({ examId, sectionId })}`);
  const [vals, setVals] = useState<Record<string, { rating: string; comment: string }>>({});
  const [remarks, setRemarks] = useState<Record<number, string>>({});
  const { run, busy } = useAction();
  useEffect(() => {
    if (!q.data) return;
    const v: Record<string, any> = {};
    for (const s of q.data.students) for (const r of s.ratings) v[`${s.student_id}:${r.domainId}`] = { rating: r.rating ?? '', comment: r.comment ?? '' };
    setVals(v);
    setRemarks(Object.fromEntries(q.data.students.map((s: any) => [s.student_id, s.teacherRemark ?? ''])));
  }, [q.data]);
  return (
    <Async q={q}>{(d) => (
      <Card title="Development ratings" actions={d.editable && <button className="btn-primary" disabled={busy} onClick={() => run(() => api.put('/api/exams/assessment/sheet', {
        examId: Number(examId), sectionId: Number(sectionId),
        entries: Object.entries(vals).map(([k, v]) => { const [s, dm] = k.split(':').map(Number); return { studentId: s, domainId: dm, rating: v.rating || null, comment: v.comment || null }; }),
        remarks: Object.entries(remarks).map(([k, v]) => ({ studentId: Number(k), teacherRemark: v || null })),
      }))}>{t('Save')}</button>} bodyClass="p-0">
        {!d.editable && <p className="m-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Assessment entry is not open.</p>}
        <div className="divide-y">{d.students.map((s: any) => (
          <div key={s.student_id} className="p-4">
            <p className="mb-2 font-medium">{s.roll_no}. {fullName(s)}</p>
            <div className="grid gap-2 md:grid-cols-2">{d.domains.map((dm: any) => { const k = `${s.student_id}:${dm.id}`; const v = vals[k] ?? { rating: '', comment: '' }; return (
              <div key={k} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
                <span className="w-40 shrink-0">{pick(dm.name, dm.name_hi)}</span>
                <select className="input w-36" disabled={!d.editable} value={v.rating} onChange={(e) => setVals({ ...vals, [k]: { ...v, rating: e.target.value } })}><option value="">—</option>{RATINGS.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                <input className="input min-w-[8rem] flex-1" placeholder="Comment" disabled={!d.editable} value={v.comment} onChange={(e) => setVals({ ...vals, [k]: { ...v, comment: e.target.value } })} />
              </div>); })}</div>
            <input className="input mt-2" placeholder="Overall teacher remark" disabled={!d.editable} value={remarks[s.student_id] ?? ''} onChange={(e) => setRemarks({ ...remarks, [s.student_id]: e.target.value })} />
          </div>))}</div>
      </Card>
    )}</Async>
  );
}

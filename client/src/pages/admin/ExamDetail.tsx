import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { Async, Card, Modal, PageHeader, StatusBadge, Tabs, useAction, useApi, useUi } from '../../components/ui';
import { api } from '../../lib/api';
import { useLookups } from '../../lib/lookups';
import { fmtDate, fmtDateTime } from '../../lib/format';
import { ExamFields } from './Exams';

export default function ExamDetail() {
  const { id } = useParams();
  const q = useApi<any>(`/api/exams/${id}`);
  const [tab, setTab] = useState<'schedule' | 'review' | 'results'>('schedule');
  const { confirm } = useUi();
  const { run, busy, fieldErrors } = useAction();
  const [edit, setEdit] = useState<any>(null);
  const { sectionsFor, sectionLabel } = useLookups();
  return (
    <Async q={q}>{(x) => (
      <>
        <PageHeader back="/admin/exams" title={x.name} subtitle={<span className="flex flex-wrap items-center gap-2">{x.exam_type.replace('_', ' ')} · {x.assessment_mode} · {fmtDate(x.start_date)} – {fmtDate(x.end_date)} <StatusBadge status={x.status} />{x.published_at && <span className="text-xs">published {fmtDateTime(x.published_at)}</span>}</span>}
          actions={<>
            {x.status !== 'published' && <button className="btn-secondary" onClick={() => setEdit({ name: x.name, examType: x.exam_type, assessmentMode: x.assessment_mode, termId: x.term_id ?? '', gradingScaleId: x.grading_scale_id ?? '', passPercent: x.pass_percent, startDate: x.start_date ?? '', endDate: x.end_date ?? '', academicYearId: x.academic_year_id })}>Edit</button>}
            {x.status !== 'published' && <button className="btn-secondary" onClick={() => run(() => api.post(`/api/exams/${id}/status`, { schedulePublished: !x.schedule_published }))}>{x.schedule_published ? 'Hide schedule' : 'Publish schedule'}</button>}
            {x.status === 'draft' && <button className="btn-primary" onClick={() => run(() => api.post(`/api/exams/${id}/status`, { status: 'marks_entry' }), { success: 'Marks entry opened for teachers.' })}>Open marks entry</button>}
            {x.status === 'marks_entry' && <>
              <button className="btn-secondary" onClick={() => run(() => api.post(`/api/exams/${id}/status`, { status: 'draft' }))}>Close marks entry</button>
              <button className="btn-primary" onClick={async () => { if (await confirm({ title: 'Publish results', message: 'Students will see their own results (approved marks only). Continue?' })) run(() => api.post(`/api/exams/${id}/publish`), { success: 'Results published.' }); }}>Publish results</button></>}
            {x.status === 'published' && <button className="btn-danger" onClick={async () => { const c = await confirm({ title: 'Withdraw results', message: 'Results will be hidden from students.', reason: true, danger: true }); if (c) run(() => api.post(`/api/exams/${id}/withdraw`, { reason: c.reason })); }}>Withdraw results</button>}
            {x.status === 'withdrawn' && <button className="btn-primary" onClick={() => run(() => api.post(`/api/exams/${id}/reopen`))}>Reopen marks entry</button>}
          </>} />
        <Tabs value={tab} onChange={setTab} tabs={[{ key: 'schedule', label: x.assessment_mode === 'marks' ? 'Subjects & schedule' : 'Classes' }, { key: 'review', label: `Marks review${x.submissions.filter((s: any) => s.status === 'submitted').length ? ` (${x.submissions.filter((s: any) => s.status === 'submitted').length})` : ''}` }, { key: 'results', label: 'Results' }]} />
        {tab === 'schedule' && (x.assessment_mode === 'marks' ? <SubjectsEditor exam={x} /> : <Card><p className="text-sm text-slate-600">Descriptive assessment applies to all preschool sections. Teachers rate each child on the configured learning areas (Settings → Assessment areas) while marks entry is open.</p></Card>)}
        {tab === 'review' && (
          <Card bodyClass="p-0">
            {x.assessment_mode === 'descriptive' ? <p className="p-4 text-sm text-slate-500">Descriptive assessments do not need per-subject approval; review them under Results before publishing.</p> : (
              <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50"><tr>{['Class', 'Subject', 'Teacher', 'Entered', 'Status', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                <tbody className="divide-y">{x.submissions.map((s: any) => (
                  <tr key={`${s.exam_subject_id}-${s.section_id}`}><td className="td">{s.class_name} – {s.section_name}</td><td className="td">{s.subject_name}</td><td className="td">{s.teacher_name ?? <span className="text-amber-600">unassigned</span>}</td>
                    <td className="td">{s.entered} / {s.students}</td><td className="td"><StatusBadge status={s.status} />{s.review_note && <p className="text-xs text-slate-500">{s.review_note}</p>}</td>
                    <td className="td whitespace-nowrap"><Link className="link mr-3" to={`/admin/exams/${id}/marks?sectionId=${s.section_id}&subjectId=${x.subjects.find((z: any) => z.id === s.exam_subject_id)?.subject_id}`}>View</Link>
                      {s.status === 'submitted' && <><button className="btn-primary btn-sm mr-1" onClick={() => run(() => api.post(`/api/exams/submissions/${s.submission_id}/review`, { action: 'approve' }), { success: 'Approved.' })}>Approve</button>
                        <button className="btn-secondary btn-sm" onClick={async () => { const c = await confirm({ title: 'Return to teacher', message: 'The teacher will be able to edit and resubmit.', reason: true }); if (c) run(() => api.post(`/api/exams/submissions/${s.submission_id}/review`, { action: 'return', note: c.reason })); }}>Return</button></>}</td></tr>))}
                  {!x.submissions.length && <tr><td className="td text-slate-500" colSpan={6}>Add subjects first.</td></tr>}</tbody></table></div>
            )}
          </Card>
        )}
        {tab === 'results' && (
          <Card><div className="flex flex-wrap gap-2">{sectionsFor(x.academic_year_id).filter((s) => (x.assessment_mode === 'descriptive') === s.is_preschool).map((s) => <Link key={s.id} className="btn-secondary btn-sm" to={`/admin/exams/${id}/results?sectionId=${s.id}`}>{sectionLabel(s)}</Link>)}</div></Card>
        )}
        {edit && (
          <Modal open onClose={() => setEdit(null)} title="Edit examination" size="lg" footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button>
            <button className="btn-primary" disabled={busy} onClick={async () => { if (await run(() => api.put(`/api/exams/${id}`, { ...edit, termId: edit.termId || null, gradingScaleId: edit.gradingScaleId || null }))) setEdit(null); }}>Save</button></>}>
            <ExamFields v={edit} set={setEdit} errors={fieldErrors} />
          </Modal>
        )}
      </>
    )}</Async>
  );
}

function SubjectsEditor({ exam }: { exam: any }) {
  const { lk } = useLookups();
  const cs = useApi<any[]>(`/api/academics/class-subjects?yearId=${exam.academic_year_id}`);
  const [classId, setClassId] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const { run, busy } = useAction();
  const locked = exam.status === 'published';
  useEffect(() => {
    if (!classId) return;
    const existing = exam.subjects.filter((s: any) => s.class_level_id === Number(classId));
    setRows(existing.length ? existing.map((s: any) => ({ subjectId: s.subject_id, maxMarks: s.max_marks, passMarks: s.pass_marks, examDate: s.exam_date ?? '', startTime: s.start_time?.slice(0, 5) ?? '', durationMin: s.duration_min ?? '' }))
      : (cs.data ?? []).filter((c) => c.class_level_id === Number(classId)).map((c) => ({ subjectId: c.subject_id, maxMarks: 100, passMarks: 33, examDate: '', startTime: '', durationMin: '' })));
  }, [classId, exam.subjects, cs.data]);
  const byClass = (lk?.classes ?? []).filter((c) => !c.is_preschool && c.is_active);
  return (
    <Card title={<select className="input" value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Class"><option value="">Choose class…</option>{byClass.map((c) => <option key={c.id} value={c.id}>{c.name} {exam.subjects.some((s: any) => s.class_level_id === c.id) ? '✓' : ''}</option>)}</select>}
      actions={classId && !locked && <button className="btn-primary" disabled={busy} onClick={() => run(() => api.put(`/api/exams/${exam.id}/subjects`, { classLevelId: Number(classId), subjects: rows }))}>Save</button>} bodyClass="p-0">
      {!classId ? (
        <div className="p-4 text-sm"><p className="text-slate-500">Configured: {[...new Set(exam.subjects.map((s: any) => s.class_name))].join(', ') || 'none yet'}.</p></div>
      ) : (
        <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50"><tr>{['Subject', 'Max marks', 'Pass marks', 'Date', 'Start', 'Duration (min)', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody className="divide-y">{rows.map((r, i) => {
            const upd = (k: string, v: any) => setRows(rows.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
            return (
              <tr key={i}><td className="td"><select className="input" value={r.subjectId} disabled={locked} onChange={(e) => upd('subjectId', Number(e.target.value))}>{lk?.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
                <td className="td"><input className="input w-24" type="number" min={1} value={r.maxMarks} disabled={locked} onChange={(e) => upd('maxMarks', e.target.value)} /></td>
                <td className="td"><input className="input w-24" type="number" min={0} value={r.passMarks} disabled={locked} onChange={(e) => upd('passMarks', e.target.value)} /></td>
                <td className="td"><input className="input" type="date" value={r.examDate} disabled={locked} onChange={(e) => upd('examDate', e.target.value)} /></td>
                <td className="td"><input className="input w-28" type="time" value={r.startTime} disabled={locked} onChange={(e) => upd('startTime', e.target.value)} /></td>
                <td className="td"><input className="input w-24" type="number" min={1} value={r.durationMin} disabled={locked} onChange={(e) => upd('durationMin', e.target.value)} /></td>
                <td className="td">{!locked && <button className="btn-ghost btn-sm text-red-600" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>}</td></tr>);
          })}</tbody></table>
          {!locked && <button className="btn-secondary btn-sm m-3" onClick={() => setRows([...rows, { subjectId: lk?.subjects[0]?.id, maxMarks: 100, passMarks: 33, examDate: '', startTime: '', durationMin: '' }])}><Plus className="h-4 w-4" />Subject</button>}
        </div>
      )}
    </Card>
  );
}

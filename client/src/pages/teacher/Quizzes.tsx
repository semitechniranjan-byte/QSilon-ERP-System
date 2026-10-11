import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Async, Card, Field, Modal, PageHeader, StatusBadge, useAction, useApi } from '../../components/ui';
import { DataTable } from '../../components/DataTable';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { fmtDateTime, fullName } from '../../lib/format';

const blankQ = (qtype = 'mcq') => ({ qtype, prompt: '', options: qtype === 'mcq' ? ['', ''] : undefined, correctOption: 0, correctBool: true, answerKey: '', marks: 1 });
const toLocal = (d?: string | null) => (d ? new Date(new Date(d).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

export default function QuizzesT() {
  const { t } = useI18n();
  const mine = useApi<any[]>('/api/academics/assignments');
  const q = useApi<any[]>('/api/learning/quizzes');
  const [edit, setEdit] = useState<any>(null);
  const [view, setView] = useState<number | null>(null);
  const { run, busy, fieldErrors } = useAction();
  return (
    <>
      <PageHeader title={t('Quizzes')} actions={<button className="btn-primary" onClick={() => setEdit({ pair: '', title: '', instructions: '', timeLimitMin: 20, availableFrom: '', availableUntil: '', maxAttempts: 1, showResults: true, questions: [blankQ()] })}><Plus className="h-4 w-4" />{t('Create')}</button>} />
      <Card bodyClass="p-0">
        <Async q={q}>{(rows) => (
          <DataTable rows={rows} onRowClick={(r) => setView(r.id)} columns={[
            { key: 'title', header: 'Title', render: (r) => <span className="font-medium">{r.title}</span> },
            { key: 'class', header: t('Class'), render: (r) => `${r.class_name} – ${r.section_name} · ${r.subject_name}` },
            { key: 'questions', header: 'Questions', className: 'text-right' },
            { key: 'window', header: 'Available', render: (r) => `${fmtDateTime(r.available_from)} → ${fmtDateTime(r.available_until)}` },
            { key: 'attempts', header: 'Attempts', className: 'text-right', render: (r) => <>{r.attempts}{r.pending_review > 0 && <span className="ml-1 text-amber-700">({r.pending_review} to grade)</span>}</> },
            { key: 'status', header: t('Status'), render: (r) => <StatusBadge status={r.status} /> },
          ]} />
        )}</Async>
      </Card>
      {edit && (
        <Modal open size="xl" onClose={() => setEdit(null)} title={edit.id ? 'Edit quiz' : 'New quiz'} footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={async () => {
            const [s, sub] = String(edit.pair).split(':').map(Number);
            const body = { ...edit, sectionId: s, subjectId: sub, timeLimitMin: edit.timeLimitMin || null, availableFrom: edit.availableFrom ? new Date(edit.availableFrom).toISOString() : null, availableUntil: edit.availableUntil ? new Date(edit.availableUntil).toISOString() : null,
              questions: edit.questions.map((x: any) => ({ ...x, correctOption: x.qtype === 'mcq' ? Number(x.correctOption) : null, correctBool: x.qtype === 'true_false' ? x.correctBool : null })) };
            if (await run(() => (edit.id ? api.put(`/api/learning/quizzes/${edit.id}`, body) : api.post('/api/learning/quizzes', body)))) setEdit(null);
          }}>Save (as draft)</button></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            {!edit.id && <Field label={`${t('Class')} & ${t('Subject')}`} className="sm:col-span-2"><select className="input" value={edit.pair} onChange={(e) => setEdit({ ...edit, pair: e.target.value })}><option value="">—</option>{mine.data?.map((a) => <option key={a.id} value={`${a.section_id}:${a.subject_id}`}>{a.class_name} – {a.section_name} · {a.subject_name}</option>)}</select></Field>}
            <Field label="Title" error={fieldErrors.title}><input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="Time limit (minutes)"><input className="input" type="number" min={1} value={edit.timeLimitMin ?? ''} onChange={(e) => setEdit({ ...edit, timeLimitMin: e.target.value })} /></Field>
            <Field label="Opens at"><input className="input" type="datetime-local" value={edit.availableFrom} onChange={(e) => setEdit({ ...edit, availableFrom: e.target.value })} /></Field>
            <Field label="Closes at"><input className="input" type="datetime-local" value={edit.availableUntil} onChange={(e) => setEdit({ ...edit, availableUntil: e.target.value })} /></Field>
            <Field label="Attempts allowed"><input className="input" type="number" min={1} max={10} value={edit.maxAttempts} onChange={(e) => setEdit({ ...edit, maxAttempts: Number(e.target.value) })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.showResults} onChange={(e) => setEdit({ ...edit, showResults: e.target.checked })} />Show score & answers after submission</label>
            <Field label="Instructions" className="sm:col-span-2"><textarea className="input" rows={2} value={edit.instructions ?? ''} onChange={(e) => setEdit({ ...edit, instructions: e.target.value })} /></Field>
          </div>
          {edit.locked && <p className="mt-3 rounded bg-amber-50 p-2 text-sm text-amber-800">Students have attempted this quiz; question changes will not be saved.</p>}
          <h3 className="mb-2 mt-5 font-semibold">Questions</h3>
          <div className="space-y-3">{edit.questions.map((x: any, i: number) => {
            const u = (patch: any) => setEdit({ ...edit, questions: edit.questions.map((y: any, j: number) => (j === i ? { ...y, ...patch } : y)) });
            return (
              <div key={i} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">Q{i + 1}</span>
                  <select className="input w-40" value={x.qtype} onChange={(e) => u({ ...blankQ(e.target.value), prompt: x.prompt, marks: x.marks })}><option value="mcq">Multiple choice</option><option value="true_false">True / False</option><option value="short_answer">Short answer</option></select>
                  <label className="flex items-center gap-1 text-sm">Marks<input className="input w-20" type="number" min={0.5} step={0.5} value={x.marks} onChange={(e) => u({ marks: e.target.value })} /></label>
                  <button className="ml-auto text-red-600" aria-label="Remove question" onClick={() => setEdit({ ...edit, questions: edit.questions.filter((_: any, j: number) => j !== i) })}><Trash2 className="h-4 w-4" /></button></div>
                <textarea className="input mt-2" rows={2} placeholder="Question" value={x.prompt} onChange={(e) => u({ prompt: e.target.value })} />
                {x.qtype === 'mcq' && <div className="mt-2 space-y-1">{x.options.map((o: string, k: number) => (
                  <div key={k} className="flex items-center gap-2"><input type="radio" name={`c${i}`} checked={Number(x.correctOption) === k} onChange={() => u({ correctOption: k })} aria-label="Correct answer" />
                    <input className="input" placeholder={`Option ${k + 1}`} value={o} onChange={(e) => u({ options: x.options.map((p: string, m: number) => (m === k ? e.target.value : p)) })} />
                    {x.options.length > 2 && <button className="text-slate-400" aria-label="Remove option" onClick={() => u({ options: x.options.filter((_: any, m: number) => m !== k), correctOption: 0 })}>×</button>}</div>))}
                  {x.options.length < 8 && <button className="link text-xs" onClick={() => u({ options: [...x.options, ''] })}>+ option</button>}<p className="text-xs text-slate-500">Select the correct option.</p></div>}
                {x.qtype === 'true_false' && <div className="mt-2 flex gap-4 text-sm"><label className="flex items-center gap-1"><input type="radio" checked={x.correctBool === true} onChange={() => u({ correctBool: true })} />True is correct</label><label className="flex items-center gap-1"><input type="radio" checked={x.correctBool === false} onChange={() => u({ correctBool: false })} />False is correct</label></div>}
                {x.qtype === 'short_answer' && <input className="input mt-2" placeholder="Model answer / key points (visible only to you)" value={x.answerKey ?? ''} onChange={(e) => u({ answerKey: e.target.value })} />}
              </div>);
          })}
            <div className="flex gap-2">{['mcq', 'true_false', 'short_answer'].map((k) => <button key={k} className="btn-secondary btn-sm" onClick={() => setEdit({ ...edit, questions: [...edit.questions, blankQ(k)] })}><Plus className="h-4 w-4" />{k.replace('_', ' ')}</button>)}</div>
            <p className="text-xs text-slate-500">Multiple choice and true/false are graded automatically. Short answers stay "pending review" until you grade them.</p>
          </div>
        </Modal>
      )}
      {view && <QuizDetail id={view} onClose={() => setView(null)} onEdit={(z) => { setView(null); setEdit({ id: z.id, pair: `${z.section_id}:${z.subject_id}`, title: z.title, instructions: z.instructions, timeLimitMin: z.time_limit_min ?? '', availableFrom: toLocal(z.available_from), availableUntil: toLocal(z.available_until), maxAttempts: z.max_attempts, showResults: z.show_results, locked: z.attempts.length > 0,
        questions: z.questions.map((x: any) => ({ qtype: x.qtype, prompt: x.prompt, options: x.qtype === 'mcq' ? x.options : undefined, correctOption: x.correct_option ?? 0, correctBool: x.correct_bool ?? true, answerKey: x.answer_key ?? '', marks: x.marks })) }); }} />}
    </>
  );
}

function QuizDetail({ id, onClose, onEdit }: { id: number; onClose: () => void; onEdit: (z: any) => void }) {
  const q = useApi<any>(`/api/learning/quizzes/${id}`);
  const [att, setAtt] = useState<number | null>(null);
  const { run } = useAction();
  return (
    <Modal open size="xl" onClose={onClose} title={q.data?.title ?? '…'} footer={q.data && <>
      <button className="btn-secondary" onClick={() => onEdit(q.data)}>Edit</button>
      {q.data.status !== 'published' && <button className="btn-primary" onClick={() => run(() => api.post(`/api/learning/quizzes/${id}/status`, { status: 'published' }), { success: 'Quiz published to students.' })}>Publish</button>}
      {q.data.status === 'published' && <button className="btn-secondary" onClick={() => run(() => api.post(`/api/learning/quizzes/${id}/status`, { status: 'closed' }))}>Close quiz</button>}</>}>
      <Async q={q}>{(z) => att ? <GradeAttempt id={att} onBack={() => setAtt(null)} /> : (
        <>
          <p className="mb-3 text-sm text-slate-600">{z.subject_name} · {z.questions.length} questions · <StatusBadge status={z.status} /></p>
          <table className="min-w-full text-sm"><thead className="bg-slate-50"><tr>{['Student', 'Attempt', 'Submitted', 'Score', 'Status', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody className="divide-y">{z.attempts.map((a: any) => <tr key={a.id}><td className="td">{fullName(a)}</td><td className="td">{a.attempt_no}</td><td className="td text-xs">{fmtDateTime(a.submitted_at)}</td><td className="td">{a.score ?? '—'} / {a.max_score ?? '—'}</td><td className="td"><StatusBadge status={a.status} /></td>
              <td className="td">{a.status !== 'in_progress' && <button className="link" onClick={() => setAtt(a.id)}>{a.status === 'pending_review' ? 'Grade' : 'View'}</button>}</td></tr>)}
              {!z.attempts.length && <tr><td className="td text-slate-500" colSpan={6}>No attempts yet.</td></tr>}</tbody></table>
        </>
      )}</Async>
    </Modal>
  );
}

function GradeAttempt({ id, onBack }: { id: number; onBack: () => void }) {
  const q = useApi<any>(`/api/learning/attempts/${id}`);
  const [m, setM] = useState<Record<number, { awardedMarks: string; feedback: string }>>({});
  const { run, busy } = useAction();
  return (
    <Async q={q}>{(a) => (
      <div>
        <button className="link mb-3 text-sm" onClick={onBack}>← All attempts</button>
        <p className="mb-3 font-medium">{fullName(a)} · score {a.score ?? '—'} / {a.max_score ?? '—'}</p>
        <ol className="space-y-3">{a.answers.map((x: any, i: number) => (
          <li key={x.question_id} className="rounded-lg border p-3 text-sm">
            <p className="font-medium">Q{i + 1}. {x.prompt} <span className="text-xs text-slate-500">({x.marks} marks)</span></p>
            <p className="mt-1">Answer: <b>{x.answer == null ? '—' : x.qtype === 'mcq' ? x.options?.[x.answer.value] : String(x.answer.value)}</b></p>
            {x.qtype === 'short_answer' ? (
              <div className="mt-2 flex flex-wrap items-end gap-2">{x.answer_key && <p className="w-full text-xs text-slate-500">Key: {x.answer_key}</p>}
                <Field label="Marks"><input className="input w-24" type="number" min={0} max={x.marks} step={0.5} value={m[x.question_id]?.awardedMarks ?? x.awarded_marks ?? ''} onChange={(e) => setM({ ...m, [x.question_id]: { awardedMarks: e.target.value, feedback: m[x.question_id]?.feedback ?? x.feedback ?? '' } })} /></Field>
                <Field label="Feedback" className="flex-1"><input className="input" value={m[x.question_id]?.feedback ?? x.feedback ?? ''} onChange={(e) => setM({ ...m, [x.question_id]: { awardedMarks: m[x.question_id]?.awardedMarks ?? x.awarded_marks ?? '', feedback: e.target.value } })} /></Field></div>
            ) : <p className={x.is_correct ? 'text-emerald-700' : 'text-red-600'}>{x.is_correct ? 'Correct' : 'Incorrect'} · {x.awarded_marks ?? 0} marks (auto-graded)</p>}
          </li>))}</ol>
        <button className="btn-primary mt-4" disabled={busy} onClick={async () => { if (await run(() => api.post(`/api/learning/attempts/${id}/grade`, { answers: Object.entries(m).filter(([, v]) => v.awardedMarks !== '').map(([k, v]) => ({ questionId: Number(k), awardedMarks: Number(v.awardedMarks), feedback: v.feedback })) }))) q.refetch(); }}>Save grades</button>
      </div>
    )}</Async>
  );
}

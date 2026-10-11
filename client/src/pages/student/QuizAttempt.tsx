import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Async, Card, PageHeader, StatusBadge, useApi, useUi } from '../../components/ui';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';

export default function QuizAttempt() {
  const { id } = useParams();
  const { t } = useI18n();
  const { toast, confirm } = useUi();
  const q = useApi<any>(`/api/me/attempts/${id}`);
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [left, setLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const dirty = useRef(false);
  const offset = useRef(0);
  useEffect(() => {
    if (!q.data) return;
    setAnswers(Object.fromEntries(q.data.questions.filter((x: any) => x.answer).map((x: any) => [x.id, x.answer.value])));
    offset.current = new Date(q.data.serverNow).getTime() - Date.now();
  }, [q.data]);
  const payload = useCallback(() => ({ answers: Object.entries(answers).map(([k, v]) => ({ questionId: Number(k), value: v })) }), [answers]);
  const submit = useCallback(async (auto = false) => {
    setSubmitting(true);
    try {
      const r = await api.post(`/api/me/attempts/${id}/submit`, payload());
      toast('success', auto ? 'Time is up — your answers were submitted.' : r.pendingReview ? 'Submitted. Some answers will be graded by your teacher.' : 'Submitted.');
      q.refetch();
    } catch (e: any) { toast('error', e.message); q.refetch(); } finally { setSubmitting(false); }
  }, [id, payload, q, toast]);
  // Timer based on the server deadline.
  useEffect(() => {
    if (!q.data?.deadlineAt || q.data.status !== 'in_progress') return;
    const tick = () => {
      const ms = new Date(q.data.deadlineAt).getTime() - (Date.now() + offset.current);
      setLeft(Math.max(0, Math.floor(ms / 1000)));
      if (ms <= 0 && !submitting) submit(true);
    };
    tick();
    const h = setInterval(tick, 1000);
    return () => clearInterval(h);
  }, [q.data, submit, submitting]);
  // Autosave every 20 seconds while answering.
  useEffect(() => {
    if (q.data?.status !== 'in_progress') return;
    const h = setInterval(() => { if (dirty.current) { dirty.current = false; api.put(`/api/me/attempts/${id}`, payload()).catch(() => {}); } }, 20000);
    return () => clearInterval(h);
  }, [q.data?.status, id, payload]);
  const set = (qid: number, v: any) => { dirty.current = true; setAnswers({ ...answers, [qid]: v }); };
  return (
    <Async q={q}>{(a) => {
      const done = a.status !== 'in_progress';
      return (
        <>
          <PageHeader title={a.title} back="/student/quizzes" subtitle={done ? <span className="flex items-center gap-2"><StatusBadge status={a.status} />{a.score != null && <b>Score: {a.score} / {a.maxScore}</b>}</span> : a.instructions}
            actions={!done && left != null && <span className={`rounded-lg px-3 py-2 font-mono text-lg font-semibold ${left < 60 ? 'bg-red-100 text-red-700' : 'bg-slate-100'}`} aria-live="polite">{t('Time left')}: {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>} />
          <div className="space-y-3">{a.questions.map((x: any, i: number) => (
            <Card key={x.id}>
              <p className="font-medium">Q{i + 1}. {x.prompt} <span className="text-xs font-normal text-slate-500">({x.marks} marks)</span></p>
              <div className="mt-3">
                {x.qtype === 'mcq' && <div className="space-y-1">{x.options.map((o: string, k: number) => (
                  <label key={k} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${done && x.correct_option === k ? 'border-emerald-400 bg-emerald-50' : ''}`}>
                    <input type="radio" name={`q${x.id}`} disabled={done} checked={answers[x.id] === k} onChange={() => set(x.id, k)} />{o}</label>))}</div>}
                {x.qtype === 'true_false' && <div className="flex gap-3">{[true, false].map((b) => (
                  <label key={String(b)} className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm ${done && x.correct_bool === b ? 'border-emerald-400 bg-emerald-50' : ''}`}><input type="radio" name={`q${x.id}`} disabled={done} checked={answers[x.id] === b} onChange={() => set(x.id, b)} />{b ? 'True' : 'False'}</label>))}</div>}
                {x.qtype === 'short_answer' && <textarea className="input" rows={3} disabled={done} value={answers[x.id] ?? ''} onChange={(e) => set(x.id, e.target.value)} />}
              </div>
              {done && x.awarded_marks != null && <p className={`mt-2 text-sm ${x.is_correct ? 'text-emerald-700' : 'text-slate-600'}`}>{x.awarded_marks} / {x.marks} marks{x.feedback ? ` · ${x.feedback}` : ''}</p>}
              {done && x.needs_review && <p className="mt-2 text-sm text-amber-700">Awaiting teacher review</p>}
            </Card>))}</div>
          {!done ? <div className="mt-4 flex gap-2"><button className="btn-secondary" onClick={() => api.put(`/api/me/attempts/${id}`, payload()).then(() => toast('success', 'Saved.')).catch((e) => toast('error', e.message))}>{t('Save')}</button>
            <button className="btn-primary" disabled={submitting} onClick={async () => { if (await confirm({ title: t('Submit'), message: 'You cannot change answers after submitting.' })) submit(); }}>{t('Submit')}</button></div>
            : <Link to="/student/quizzes" className="btn-secondary mt-4">{t('Back')}</Link>}
          {done && a.score == null && a.status === 'graded' && <p className="mt-2 text-sm text-slate-500">Your teacher has chosen not to show scores for this quiz.</p>}
        </>
      );
    }}</Async>
  );
}

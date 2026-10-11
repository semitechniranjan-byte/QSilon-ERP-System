import { useNavigate } from 'react-router-dom';
import { Async, Card, PageHeader, StatusBadge, useApi, useUi } from '../../components/ui';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { fmtDateTime } from '../../lib/format';

export default function StudentQuizzes() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { toast, confirm } = useUi();
  const q = useApi<any[]>('/api/me/quizzes');
  const now = Date.now();
  return (
    <>
      <PageHeader title={t('Quizzes')} />
      <Async q={q}>{(rows) => (
        <div className="grid gap-3 md:grid-cols-2">{rows.map((z) => {
          const attempts = z.attempts ?? [];
          const open = attempts.find((a: any) => a.status === 'in_progress');
          const notYet = z.available_from && new Date(z.available_from).getTime() > now;
          const closed = z.status === 'closed' || (z.available_until && new Date(z.available_until).getTime() < now);
          const left = z.max_attempts - attempts.length;
          return (
            <Card key={z.id} title={z.title}>
              <p className="text-sm text-slate-600">{z.subject_name} · {z.questions} questions{z.time_limit_min ? ` · ${z.time_limit_min} min` : ''}</p>
              <p className="text-xs text-slate-500">{z.available_from && `Opens ${fmtDateTime(z.available_from)} · `}{z.available_until && `Closes ${fmtDateTime(z.available_until)}`}</p>
              {z.instructions && <p className="mt-2 text-sm">{z.instructions}</p>}
              <ul className="mt-2 space-y-1 text-sm">{attempts.map((a: any) => <li key={a.id} className="flex items-center gap-2">Attempt {a.attempt_no}: <StatusBadge status={a.status} />{a.score != null && <b>{a.score}/{a.max_score}</b>}{a.status !== 'in_progress' && <button className="link text-xs" onClick={() => nav(`/student/quizzes/attempt/${a.id}`)}>View</button>}</li>)}</ul>
              <div className="mt-3">
                {open ? <button className="btn-primary" onClick={() => nav(`/student/quizzes/attempt/${open.id}`)}>Continue</button>
                  : notYet ? <p className="text-sm text-slate-500">Not open yet.</p>
                  : closed ? <p className="text-sm text-slate-500">Closed.</p>
                  : left > 0 ? <button className="btn-primary" onClick={async () => {
                      if (!(await confirm({ title: t('Start quiz'), message: z.time_limit_min ? `You will have ${z.time_limit_min} minutes. The timer cannot be paused.` : 'Answers are saved as you go.' }))) return;
                      try { const r = await api.post(`/api/me/quizzes/${z.id}/start`); nav(`/student/quizzes/attempt/${r.attemptId}`); } catch (e: any) { toast('error', e.message); }
                    }}>{t('Start quiz')}</button>
                  : <p className="text-sm text-slate-500">No attempts left.</p>}
              </div>
            </Card>);
        })}{!rows.length && <Card><p className="text-sm text-slate-500">No quizzes yet.</p></Card>}</div>
      )}</Async>
    </>
  );
}

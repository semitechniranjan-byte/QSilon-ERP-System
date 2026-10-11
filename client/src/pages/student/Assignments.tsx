import { useState } from 'react';
import { Async, Card, Field, FileInput, Modal, PageHeader, StatusBadge, useAction, useApi } from '../../components/ui';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { fmtDate, fmtDateTime } from '../../lib/format';

export default function StudentAssignments() {
  const { t, pick } = useI18n();
  const q = useApi<any[]>('/api/me/assignments');
  const [subject, setSubject] = useState('');
  const [sub, setSub] = useState<any>(null);
  const { run, busy } = useAction();
  return (
    <>
      <PageHeader title={t('Assignments')} actions={<select className="input w-48" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label={t('Subject')}><option value="">{t('All')}</option>{[...new Set((q.data ?? []).map((a) => a.subject_name))].map((s) => <option key={s}>{s}</option>)}</select>} />
      <Async q={q}>{(rows) => (
        <div className="space-y-3">{rows.filter((a) => !subject || a.subject_name === subject).map((a) => (
          <Card key={a.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><h2 className="font-semibold">{a.title}</h2><p className="text-xs text-slate-500">{pick(a.subject_name, a.subject_name_hi)} · {a.teacher} · {t('Due date')}: {fmtDate(a.due_date)}{a.max_marks ? ` · max ${a.max_marks}` : ''}</p></div>
              <StatusBadge status={a.status} />
            </div>
            {a.description && <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{a.description}</p>}
            {a.attachment_file_id && <a className="link mt-2 inline-block text-sm" href={`/api/files/${a.attachment_file_id}`} target="_blank" rel="noreferrer">Download material</a>}
            {(a.feedback || a.marks != null) && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm">Teacher feedback: {a.feedback ?? '—'}{a.marks != null && ` · Marks: ${a.marks}${a.max_marks ? `/${a.max_marks}` : ''}`}</p>}
            {a.submitted_at && <p className="mt-2 text-xs text-slate-500">Submitted {fmtDateTime(a.submitted_at)}</p>}
            {a.allow_submission && a.status !== 'completed' && <button className="btn-primary btn-sm mt-3" onClick={() => setSub({ id: a.id, title: a.title, text: a.text_answer ?? '', fileId: a.file_id, fileName: '' })}>{a.submitted_at ? 'Update submission' : t('Submit')}</button>}
          </Card>))}
          {!rows.length && <Card><p className="text-sm text-slate-500">No assignments yet.</p></Card>}
        </div>
      )}</Async>
      {sub && (
        <Modal open onClose={() => setSub(null)} title={sub.title} footer={<><button className="btn-secondary" onClick={() => setSub(null)}>{t('Cancel')}</button>
          <button className="btn-primary" disabled={busy || (!sub.text && !sub.fileId)} onClick={async () => { if (await run(() => api.post(`/api/me/assignments/${sub.id}/submit`, { text: sub.text, fileId: sub.fileId }), { success: 'Submitted.' })) setSub(null); }}>{t('Submit')}</button></>}>
          <Field label="Your answer"><textarea className="input" rows={8} value={sub.text} onChange={(e) => setSub({ ...sub, text: e.target.value })} /></Field>
          <div className="mt-3 flex items-center gap-2 text-sm">{sub.fileId && <span className="text-emerald-700">File attached {sub.fileName}</span>}<FileInput purpose="submission" accept="application/pdf,image/*,.docx" label="Attach file" onUploaded={(f) => setSub({ ...sub, fileId: f.id, fileName: f.name })} /></div>
        </Modal>
      )}
    </>
  );
}

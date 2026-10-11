import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Async, Card, Field, FileInput, Modal, PageHeader, StatusBadge, useAction, useApi } from '../../components/ui';
import { DataTable } from '../../components/DataTable';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { fmtDate, fmtDateTime, fullName } from '../../lib/format';

export default function AssignmentsT() {
  const { t } = useI18n();
  const [sp] = useSearchParams();
  const mine = useApi<any[]>('/api/academics/assignments');
  const [sectionId, setSectionId] = useState(sp.get('sectionId') ?? '');
  const q = useApi<any[]>(`/api/learning/assignments${sectionId ? `?sectionId=${sectionId}` : ''}`);
  const [edit, setEdit] = useState<any>(null);
  const [view, setView] = useState<number | null>(null);
  const { run, busy, fieldErrors } = useAction();
  const sections = [...new Map((mine.data ?? []).map((a) => [a.section_id, a])).values()];
  return (
    <>
      <PageHeader title={t('Assignments')} actions={<>
        <select className="input w-52" value={sectionId} onChange={(e) => setSectionId(e.target.value)} aria-label={t('Section')}><option value="">All my assignments</option>{sections.map((s: any) => <option key={s.section_id} value={s.section_id}>{s.class_name} – {s.section_name}</option>)}</select>
        <button className="btn-primary" onClick={() => setEdit({ pair: sp.get('sectionId') && sp.get('subjectId') ? `${sp.get('sectionId')}:${sp.get('subjectId')}` : '', title: '', description: '', dueDate: '', maxMarks: '', allowSubmission: true, attachmentFileId: null, status: 'published' })}><Plus className="h-4 w-4" />{t('Create')}</button></>} />
      <Card bodyClass="p-0">
        <Async q={q}>{(rows) => (
          <DataTable rows={rows} onRowClick={(r) => setView(r.id)} search={(r) => `${r.title} ${r.subject_name}`} columns={[
            { key: 'title', header: 'Title', render: (r) => <span className="font-medium">{r.title}</span> },
            { key: 'class', header: t('Class'), render: (r) => `${r.class_name} – ${r.section_name}` }, { key: 'subject_name', header: t('Subject') },
            { key: 'due_date', header: t('Due date'), render: (r) => fmtDate(r.due_date), sortValue: (r) => r.due_date },
            { key: 'progress', header: 'Submitted', render: (r) => `${r.submitted}/${r.students} (${r.completed} reviewed)` },
            { key: 'status', header: t('Status'), render: (r) => <StatusBadge status={r.status} /> },
          ]} />
        )}</Async>
      </Card>
      {edit && (
        <Modal open size="lg" onClose={() => setEdit(null)} title={edit.id ? t('Edit') : 'New assignment'} footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>{t('Cancel')}</button>
          <button className="btn-primary" disabled={busy} onClick={async () => {
            const [s, sub] = String(edit.pair).split(':').map(Number);
            const body = { sectionId: s, subjectId: sub, title: edit.title, description: edit.description, dueDate: edit.dueDate || null, maxMarks: edit.maxMarks || null, allowSubmission: edit.allowSubmission, attachmentFileId: edit.attachmentFileId, status: edit.status };
            if (await run(() => (edit.id ? api.put(`/api/learning/assignments/${edit.id}`, body) : api.post('/api/learning/assignments', body)))) setEdit(null);
          }}>{t('Save')}</button></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            {!edit.id && <Field label={`${t('Class')} & ${t('Subject')}`} className="sm:col-span-2"><select className="input" value={edit.pair} onChange={(e) => setEdit({ ...edit, pair: e.target.value })}><option value="">—</option>{mine.data?.map((a) => <option key={a.id} value={`${a.section_id}:${a.subject_id}`}>{a.class_name} – {a.section_name} · {a.subject_name}</option>)}</select></Field>}
            <Field label="Title" required className="sm:col-span-2" error={fieldErrors.title}><input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="Instructions" className="sm:col-span-2"><textarea className="input" rows={5} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label={t('Due date')}><input type="date" className="input" value={edit.dueDate} onChange={(e) => setEdit({ ...edit, dueDate: e.target.value })} /></Field>
            <Field label="Max marks (optional)"><input type="number" min={1} className="input" value={edit.maxMarks} onChange={(e) => setEdit({ ...edit, maxMarks: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.allowSubmission} onChange={(e) => setEdit({ ...edit, allowSubmission: e.target.checked })} />Allow online submission</label>
            <Field label="Status"><select className="input" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="published">Published</option><option value="draft">Draft (hidden)</option><option value="closed">Closed</option></select></Field>
            <div className="flex items-center gap-2 text-sm">{edit.attachmentFileId && <span className="text-emerald-700">Material attached</span>}<FileInput purpose="assignment_attachment" accept="application/pdf,image/*,.docx" label="Attach material" onUploaded={(f) => setEdit({ ...edit, attachmentFileId: f.id })} /></div>
          </div>
        </Modal>
      )}
      {view && <AssignmentDetail id={view} onEdit={(a) => { setView(null); setEdit({ id: a.id, pair: `${a.section_id}:${a.subject_id}`, title: a.title, description: a.description ?? '', dueDate: a.due_date ?? '', maxMarks: a.max_marks ?? '', allowSubmission: a.allow_submission, attachmentFileId: a.attachment_file_id, status: a.status }); }} onClose={() => setView(null)} />}
    </>
  );
}

function AssignmentDetail({ id, onClose, onEdit }: { id: number; onClose: () => void; onEdit: (a: any) => void }) {
  const q = useApi<any>(`/api/learning/assignments/${id}`);
  const [rev, setRev] = useState<any>(null);
  const { run, busy } = useAction();
  return (
    <Modal open size="xl" onClose={onClose} title={q.data?.title ?? '…'} footer={<><button className="btn-secondary" onClick={() => q.data && onEdit(q.data)}>Edit assignment</button><button className="btn-primary" onClick={onClose}>Close</button></>}>
      <Async q={q}>{(a) => (
        <>
          <p className="mb-3 text-sm text-slate-600">{a.class_name} – {a.section_name} · {a.subject_name} · due {fmtDate(a.due_date)}{a.max_marks ? ` · max ${a.max_marks}` : ''}</p>
          <table className="min-w-full text-sm"><thead className="bg-slate-50"><tr>{['#', 'Student', 'Status', 'Submitted', 'Marks', 'Feedback', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody className="divide-y">{a.students.map((s: any) => (
              <tr key={s.student_id}><td className="td">{s.roll_no}</td><td className="td">{fullName(s)}</td><td className="td"><StatusBadge status={s.status} /></td><td className="td text-xs">{fmtDateTime(s.submitted_at)}</td><td className="td">{s.marks ?? '—'}</td><td className="td text-xs">{s.feedback ?? ''}</td>
                <td className="td"><button className="link" onClick={() => setRev({ ...s, newStatus: s.status === 'submitted' ? 'completed' : s.status, marks: s.marks ?? '', feedback: s.feedback ?? '' })}>Review</button></td></tr>))}</tbody></table>
          {rev && (
            <div className="mt-4 rounded-lg border p-4">
              <p className="font-medium">{fullName(rev)}</p>
              {rev.text_answer && <p className="mt-2 whitespace-pre-line rounded bg-slate-50 p-3 text-sm">{rev.text_answer}</p>}
              {rev.file_id && <a className="link mt-2 inline-block text-sm" href={`/api/files/${rev.file_id}`} target="_blank" rel="noreferrer">Open submitted file</a>}
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Status"><select className="input" value={rev.newStatus} onChange={(e) => setRev({ ...rev, newStatus: e.target.value })}><option value="completed">Completed</option><option value="pending">Pending</option><option value="returned">Returned for rework</option></select></Field>
                <Field label="Marks"><input className="input" type="number" min={0} value={rev.marks} onChange={(e) => setRev({ ...rev, marks: e.target.value })} /></Field>
                <Field label="Feedback"><input className="input" value={rev.feedback} onChange={(e) => setRev({ ...rev, feedback: e.target.value })} /></Field>
              </div>
              <div className="mt-3 flex gap-2"><button className="btn-primary btn-sm" disabled={busy} onClick={async () => { if (await run(() => api.post(`/api/learning/assignments/${id}/review`, { studentId: rev.student_id, status: rev.newStatus, marks: rev.marks, feedback: rev.feedback }))) setRev(null); }}>Save review</button><button className="btn-secondary btn-sm" onClick={() => setRev(null)}>Cancel</button></div>
            </div>
          )}
        </>
      )}</Async>
    </Modal>
  );
}

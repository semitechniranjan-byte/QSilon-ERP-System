import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Async, Card, Field, FileInput, Modal, PageHeader, useAction, useApi, useUi } from '../../components/ui';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { fmtDate } from '../../lib/format';

export default function MaterialsT() {
  const { t } = useI18n();
  const mine = useApi<any[]>('/api/academics/assignments');
  const sections = [...new Map((mine.data ?? []).map((a) => [a.section_id, a])).values()] as any[];
  const [sectionId, setSectionId] = useState('');
  useEffect(() => { if (!sectionId && sections.length) setSectionId(String(sections[0].section_id)); }, [sections, sectionId]);
  const q = useApi<any[]>(sectionId ? `/api/learning/materials?sectionId=${sectionId}` : null);
  const [add, setAdd] = useState<any>(null);
  const { confirm } = useUi();
  const { run, busy } = useAction();
  return (
    <>
      <PageHeader title={t('Study Materials')} actions={<>
        <select className="input w-52" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>{sections.map((s) => <option key={s.section_id} value={s.section_id}>{s.class_name} – {s.section_name}</option>)}</select>
        <button className="btn-primary" disabled={!sectionId} onClick={() => setAdd({ subjectId: mine.data?.find((a) => String(a.section_id) === sectionId)?.subject_id ?? '', title: '', description: '', fileId: null, linkUrl: '' })}><Plus className="h-4 w-4" />{t('Add')}</button></>} />
      <Card bodyClass="p-0">
        <Async q={q}>{(rows) => (
          <ul className="divide-y">{rows.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-3 p-4"><div><p className="font-medium">{m.title} <span className="text-xs text-slate-500">· {m.subject_name} · {fmtDate(m.created_at)}</span></p>
              {m.description && <p className="text-sm text-slate-600">{m.description}</p>}
              <div className="mt-1 flex gap-3 text-sm">{m.file_id && <a className="link" href={`/api/files/${m.file_id}`} target="_blank" rel="noreferrer">{m.original_name ?? 'File'}</a>}{m.link_url && <a className="link" href={m.link_url} target="_blank" rel="noopener noreferrer">Open link</a>}</div></div>
              <button className="text-red-600" aria-label="Delete" onClick={async () => { if (await confirm({ title: 'Delete material', message: m.title, danger: true })) run(() => api.del(`/api/learning/materials/${m.id}`)); }}><Trash2 className="h-4 w-4" /></button></li>))}
            {!rows.length && <li className="p-4 text-sm text-slate-500">No materials shared yet.</li>}</ul>
        )}</Async>
      </Card>
      {add && (
        <Modal open onClose={() => setAdd(null)} title="Share study material" footer={<><button className="btn-secondary" onClick={() => setAdd(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={async () => { if (await run(() => api.post('/api/learning/materials', { ...add, sectionId: Number(sectionId), subjectId: Number(add.subjectId) }))) setAdd(null); }}>Share</button></>}>
          <div className="grid gap-3">
            <Field label={t('Subject')}><select className="input" value={add.subjectId} onChange={(e) => setAdd({ ...add, subjectId: e.target.value })}>{mine.data?.filter((a) => String(a.section_id) === sectionId).map((a) => <option key={a.subject_id} value={a.subject_id}>{a.subject_name}</option>)}</select></Field>
            <Field label="Title"><input className="input" value={add.title} onChange={(e) => setAdd({ ...add, title: e.target.value })} /></Field>
            <Field label="Description"><textarea className="input" rows={2} value={add.description} onChange={(e) => setAdd({ ...add, description: e.target.value })} /></Field>
            <Field label="Link (optional)"><input className="input" type="url" placeholder="https://" value={add.linkUrl} onChange={(e) => setAdd({ ...add, linkUrl: e.target.value })} /></Field>
            <div className="flex items-center gap-2 text-sm">{add.fileId && <span className="text-emerald-700">File attached</span>}<FileInput purpose="material" accept="application/pdf,image/*,.docx" label="Attach file" onUploaded={(f) => setAdd({ ...add, fileId: f.id })} /></div>
          </div>
        </Modal>
      )}
    </>
  );
}

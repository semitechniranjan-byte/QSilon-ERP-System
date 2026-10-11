import { useState } from 'react';
import { Field, FileInput, Modal, useAction } from './ui';
import { api } from '../lib/api';

export function NoticeModal({ notice, sections, teacherMode, onClose }: { notice: any; sections: any[]; teacherMode?: boolean; onClose: () => void }) {
  const [v, setV] = useState<any>(notice);
  const { run, busy, fieldErrors } = useAction();
  const audiences = teacherMode ? [['section', 'One of my sections']] : [['public', 'Public website + everyone'], ['all', 'All staff & students'], ['staff', 'Staff only'], ['teachers', 'Teachers'], ['students', 'All students'], ['section', 'One section'], ['hostel', 'Hostel residents']];
  return (
    <Modal open size="lg" onClose={onClose} title={v.id ? 'Edit notice' : 'New notice'} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button>
      <button className="btn-primary" disabled={busy} onClick={async () => {
        const body = { ...v, sectionId: v.audience === 'section' ? Number(v.sectionId) || null : null, publishAt: v.publishAt ? new Date(v.publishAt).toISOString() : null, expiresAt: v.expiresAt ? new Date(v.expiresAt).toISOString() : null };
        if (await run(() => (v.id ? api.put(`/api/notices/${v.id}`, body) : api.post('/api/notices', body)))) onClose();
      }}>Publish</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title" required error={fieldErrors.title}><input className="input" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
        <Field label="Title (Hindi)"><input className="input" value={v.titleHi ?? ''} onChange={(e) => setV({ ...v, titleHi: e.target.value })} /></Field>
        <Field label="Message" required className="sm:col-span-2" error={fieldErrors.body}><textarea className="input" rows={5} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} /></Field>
        <Field label="Message (Hindi)" className="sm:col-span-2"><textarea className="input" rows={3} value={v.bodyHi ?? ''} onChange={(e) => setV({ ...v, bodyHi: e.target.value })} /></Field>
        <Field label="Audience"><select className="input" value={v.audience} onChange={(e) => setV({ ...v, audience: e.target.value })}>{audiences.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        {v.audience === 'section' && <Field label="Section"><select className="input" value={v.sectionId ?? ''} onChange={(e) => setV({ ...v, sectionId: e.target.value })}><option value="">—</option>{sections.map((s) => <option key={s.id} value={s.id}>{s.class_name} – {s.name}</option>)}</select></Field>}
        <Field label="Publish at (optional)"><input type="datetime-local" className="input" value={v.publishAt ?? ''} onChange={(e) => setV({ ...v, publishAt: e.target.value })} /></Field>
        <Field label="Expires at (optional)"><input type="datetime-local" className="input" value={v.expiresAt ?? ''} onChange={(e) => setV({ ...v, expiresAt: e.target.value })} /></Field>
        {!teacherMode && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.pinned} onChange={(e) => setV({ ...v, pinned: e.target.checked })} />Pin to top</label>}
        <div className="flex items-center gap-2 text-sm">{v.attachmentFileId && <span className="text-emerald-700">Attachment added</span>}<FileInput purpose="notice_attachment" accept="application/pdf,image/*" label={v.attachmentFileId ? 'Replace attachment' : 'Attach file'} onUploaded={(f) => setV({ ...v, attachmentFileId: f.id })} /></div>
      </div>
    </Modal>
  );
}

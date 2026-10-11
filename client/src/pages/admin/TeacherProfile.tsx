import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { Async, Card, Field, Modal, PageHeader, StatusBadge, useAction, useApi, useUi } from '../../components/ui';
import { CredentialsModal } from '../../components/Credentials';
import { TeacherFields } from './Teachers';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useLookups } from '../../lib/lookups';
import { fmtDate, fmtDateTime, fullName } from '../../lib/format';

export default function TeacherProfile() {
  const { id } = useParams();
  const { t } = useI18n();
  const q = useApi<any>(`/api/teachers/${id}`);
  const { confirm } = useUi();
  const { run, busy, fieldErrors } = useAction();
  const [edit, setEdit] = useState<any>(null);
  const [assign, setAssign] = useState(false);
  const [creds, setCreds] = useState<any>(null);
  return (
    <Async q={q}>{(tch) => (
      <>
        <PageHeader back="/admin/teachers" title={fullName(tch)} subtitle={<span className="flex items-center gap-2"><span className="font-mono">{tch.employee_code}</span> <StatusBadge status={tch.status} /></span>}
          actions={<>
            <button className="btn-secondary" onClick={() => setEdit({ firstName: tch.first_name, lastName: tch.last_name ?? '', gender: tch.gender ?? '', dob: tch.dob ?? '', phone: tch.phone ?? '', email: tch.email ?? '', address: tch.address ?? '',
              qualification: tch.qualification ?? '', experienceYears: tch.experience_years ?? '', designation: tch.designation ?? '', joiningDate: tch.joining_date ?? '', photoFileId: tch.photo_file_id })}>{t('Edit')}</button>
            <button className="btn-secondary" onClick={async () => { if (await confirm({ title: 'Reset password', message: 'Issue a new temporary password? The teacher will be signed out.' })) { const r = await run(() => api.post(`/api/teachers/${id}/reset-password`), { success: false }); if (r) setCreds({ ...r, name: fullName(tch) }); } }}>Reset password</button>
            {tch.status === 'active'
              ? <button className="btn-danger" onClick={async () => { if (await confirm({ title: 'Deactivate teacher', message: 'The teacher will be signed out and unable to log in. Records are preserved.', danger: true })) run(() => api.post(`/api/teachers/${id}/status`, { status: 'inactive' })); }}>Deactivate</button>
              : <button className="btn-primary" onClick={() => run(() => api.post(`/api/teachers/${id}/status`, { status: 'active' }))}>Activate</button>}
          </>} />
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Profile" className="lg:col-span-2">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {[[t('Phone'), tch.phone], [t('Email'), tch.email], ['Qualification', tch.qualification], ['Experience', tch.experience_years != null ? `${tch.experience_years} years` : null],
                ['Designation', tch.designation], ['Joining date', fmtDate(tch.joining_date)], [t('Address'), tch.address], ['Login', `${tch.username ?? '—'} · last sign-in ${fmtDateTime(tch.last_login_at)}`]]
                .map(([k, v]) => <div key={k}><dt className="text-xs uppercase text-slate-500">{k}</dt><dd>{v || '—'}</dd></div>)}
            </dl>
          </Card>
          <Card title="Attendance (last 12 months)">
            <p className="text-sm">{tch.attendance.present} present · {tch.attendance.half_day} half-day · {tch.attendance.absent} absent · {tch.attendance.leave} leave</p>
            <h3 className="mt-4 text-sm font-semibold">Class teacher of</h3>
            <ul className="text-sm">{tch.classTeacher.map((c: any) => <li key={c.id}>{c.class_name} – {c.section} ({c.year})</li>)}{!tch.classTeacher.length && <li className="text-slate-500">—</li>}</ul>
          </Card>
        </div>
        <Card title="Subject & class assignments" className="mt-4" actions={<button className="btn-primary btn-sm" onClick={() => setAssign(true)}>Assign subjects</button>} bodyClass="p-0">
          <table className="min-w-full text-sm"><thead className="bg-slate-50"><tr><th className="th">{t('Academic Year')}</th><th className="th">{t('Class')}</th><th className="th">{t('Subject')}</th><th className="th" /></tr></thead>
            <tbody className="divide-y">{tch.assignments.map((a: any) => (
              <tr key={a.id}><td className="td">{a.year}</td><td className="td">{a.class_name} – {a.section}</td><td className="td">{a.subject}</td>
                <td className="td text-right">{a.is_current && <button className="btn-ghost btn-sm text-red-600" aria-label="Remove" onClick={async () => { if (await confirm({ title: 'Remove assignment', message: `Remove ${a.subject} in ${a.class_name}-${a.section}?`, danger: true })) run(() => api.del(`/api/academics/assignments/${a.id}`)); }}><Trash2 className="h-4 w-4" /></button>}</td></tr>))}
              {!tch.assignments.length && <tr><td className="td text-slate-500" colSpan={4}>No assignments yet.</td></tr>}</tbody></table>
        </Card>
        {edit && (
          <Modal open onClose={() => setEdit(null)} title={t('Edit')} size="lg" footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>{t('Cancel')}</button>
            <button className="btn-primary" disabled={busy} onClick={async () => { if (await run(() => api.put(`/api/teachers/${id}`, edit))) setEdit(null); }}>{t('Save')}</button></>}>
            <TeacherFields f={edit} set={(k, v) => setEdit({ ...edit, [k]: v })} errors={fieldErrors} />
          </Modal>
        )}
        {assign && <AssignModal teacherId={Number(id)} onClose={() => setAssign(false)} />}
        <CredentialsModal creds={creds} onClose={() => setCreds(null)} />
      </>
    )}</Async>
  );
}

function AssignModal({ teacherId, onClose }: { teacherId: number; onClose: () => void }) {
  const { current, sectionsFor, sectionLabel } = useLookups();
  const cs = useApi<any[]>('/api/academics/class-subjects');
  const existing = useApi<any[]>('/api/academics/assignments');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [replace, setReplace] = useState(false);
  const { run, busy } = useAction();
  const sections = sectionsFor(current?.id);
  const holder = (sec: number, sub: number) => existing.data?.find((a) => a.section_id === sec && a.subject_id === sub);
  return (
    <Modal open onClose={onClose} title="Assign subjects to classes" size="xl" footer={<>
      <label className="mr-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />Replace the current teacher where a subject is already assigned</label>
      <button className="btn-secondary" onClick={onClose}>Cancel</button>
      <button className="btn-primary" disabled={busy || !sel.size} onClick={async () => {
        const items = [...sel].map((k) => { const [s, b] = k.split(':').map(Number); return { sectionId: s, subjectId: b }; });
        if (await run(() => api.post('/api/academics/assignments', { teacherId, items, replace }))) onClose();
      }}>Assign {sel.size || ''}</button></>}>
      <p className="mb-3 text-sm text-slate-500">Only subjects mapped to a class (Classes & Sections → Subjects) can be assigned.</p>
      <div className="space-y-3">{sections.map((s) => {
        const subs = (cs.data ?? []).filter((c) => c.class_level_id === s.class_level_id);
        if (!subs.length) return null;
        return (
          <div key={s.id} className="rounded-lg border p-3">
            <p className="mb-2 text-sm font-semibold">{sectionLabel(s)}</p>
            <div className="flex flex-wrap gap-2">{subs.map((c) => {
              const k = `${s.id}:${c.subject_id}`;
              const h = holder(s.id, c.subject_id);
              const mine = h?.teacher_id === teacherId;
              return (
                <label key={k} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${mine ? 'border-emerald-300 bg-emerald-50' : ''}`}>
                  <input type="checkbox" disabled={mine} checked={mine || sel.has(k)} onChange={(e) => { const n = new Set(sel); e.target.checked ? n.add(k) : n.delete(k); setSel(n); }} />
                  {c.subject_name}{h && !mine && <span className="text-xs text-amber-700">({h.teacher_name})</span>}
                </label>);
            })}</div>
          </div>);
      })}</div>
      {!sections.length && <Field label=""><p className="text-sm text-slate-500">No sections in the current year.</p></Field>}
    </Modal>
  );
}

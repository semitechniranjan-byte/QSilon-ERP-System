import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Async, Card, Field, Modal, PageHeader, StatusBadge, Tabs, useAction, useApi } from '../../components/ui';
import { DataTable } from '../../components/DataTable';
import { CredentialsModal } from '../../components/Credentials';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { fullName, todayISO } from '../../lib/format';

export const emptyTeacher = { firstName: '', lastName: '', gender: '', dob: '', phone: '', email: '', address: '', qualification: '', experienceYears: '', designation: '', joiningDate: todayISO(), photoFileId: null as string | null };

export function TeacherFields({ f, set, errors }: { f: any; set: (k: string, v: any) => void; errors: Record<string, string[]> }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="First name" required error={errors.firstName}><input className="input" required value={f.firstName} onChange={(e) => set('firstName', e.target.value)} /></Field>
      <Field label="Last name" error={errors.lastName}><input className="input" value={f.lastName} onChange={(e) => set('lastName', e.target.value)} /></Field>
      <Field label={t('Gender')} error={errors.gender}><select className="input" value={f.gender} onChange={(e) => set('gender', e.target.value)}><option value="">—</option><option value="male">{t('Male')}</option><option value="female">{t('Female')}</option><option value="other">{t('Other')}</option></select></Field>
      <Field label={t('Date of Birth')} error={errors.dob}><input type="date" className="input" value={f.dob} onChange={(e) => set('dob', e.target.value)} /></Field>
      <Field label={t('Phone')} error={errors.phone}><input className="input" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
      <Field label={t('Email')} error={errors.email}><input type="email" className="input" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
      <Field label="Qualification" error={errors.qualification}><input className="input" value={f.qualification} onChange={(e) => set('qualification', e.target.value)} /></Field>
      <Field label="Experience (years)" error={errors.experienceYears}><input className="input" type="number" min={0} step="0.5" value={f.experienceYears} onChange={(e) => set('experienceYears', e.target.value)} /></Field>
      <Field label="Designation" error={errors.designation}><input className="input" value={f.designation} onChange={(e) => set('designation', e.target.value)} placeholder="PRT / TGT / PGT…" /></Field>
      <Field label="Joining date" error={errors.joiningDate}><input type="date" className="input" value={f.joiningDate} onChange={(e) => set('joiningDate', e.target.value)} /></Field>
      <Field label={t('Address')} className="sm:col-span-2" error={errors.address}><textarea className="input" rows={2} value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
    </div>
  );
}

export default function Teachers() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [tab, setTab] = useState<'list' | 'attendance'>('list');
  const [status, setStatus] = useState('active');
  const q = useApi<any[]>(`/api/teachers?status=${status}`);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ ...emptyTeacher });
  const [creds, setCreds] = useState<any>(null);
  const { run, busy, fieldErrors } = useAction();
  return (
    <>
      <PageHeader title={t('Teachers')} actions={<button className="btn-primary" onClick={() => { setF({ ...emptyTeacher }); setOpen(true); }}><Plus className="h-4 w-4" />{t('Add')}</button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'list', label: t('Teachers') }, { key: 'attendance', label: 'Staff attendance' }]} />
      {tab === 'list' ? (
        <Card bodyClass="p-0">
          <Async q={q}>{(rows) => (
            <DataTable rows={rows} onRowClick={(r) => nav(`/admin/teachers/${r.id}`)} search={(r) => `${fullName(r)} ${r.employee_code} ${r.subjects} ${r.phone ?? ''}`}
              toolbar={<select className="input w-36" value={status} onChange={(e) => setStatus(e.target.value)}>{['active', 'inactive', 'left', 'all'].map((s) => <option key={s}>{s}</option>)}</select>}
              columns={[
                { key: 'employee_code', header: 'Teacher ID', render: (r) => <span className="font-mono text-xs">{r.employee_code}</span>, sortValue: (r) => r.employee_code },
                { key: 'name', header: t('Name'), render: (r) => <span className="font-medium">{fullName(r)}</span>, sortValue: fullName },
                { key: 'subjects', header: t('Subjects'), render: (r) => <span className="text-xs">{r.subjects || '—'}</span> },
                { key: 'assignment_count', header: 'Periods/classes', className: 'text-right' },
                { key: 'class_teacher_of', header: 'Class teacher', render: (r) => r.class_teacher_of || '—' },
                { key: 'phone', header: t('Phone') },
                { key: 'status', header: t('Status'), render: (r) => <StatusBadge status={r.status} /> },
              ]} />
          )}</Async>
        </Card>
      ) : <StaffAttendance />}
      <Modal open={open} onClose={() => setOpen(false)} title="New teacher" size="lg" footer={<><button className="btn-secondary" onClick={() => setOpen(false)}>{t('Cancel')}</button>
        <button className="btn-primary" disabled={busy} onClick={async () => {
          const r = await run(() => api.post('/api/teachers', f), { success: 'Teacher created.' });
          if (r) { setOpen(false); setCreds({ username: r.username, temporaryPassword: r.temporaryPassword, name: fullName(r.teacher), id: r.teacher.id }); }
        }}>{t('Create')}</button></>}>
        <TeacherFields f={f} set={(k, v) => setF({ ...f, [k]: v })} errors={fieldErrors} />
        <p className="mt-3 text-xs text-slate-500">A unique Teacher ID and login are generated automatically. Assign subjects and classes from the teacher's page.</p>
      </Modal>
      <CredentialsModal creds={creds} onClose={() => { const id = creds?.id; setCreds(null); if (id) nav(`/admin/teachers/${id}`); }} />
    </>
  );
}

function StaffAttendance() {
  const { t } = useI18n();
  const [date, setDate] = useState(todayISO());
  const q = useApi<any[]>(`/api/teachers/attendance?date=${date}`);
  const [vals, setVals] = useState<Record<number, string>>({});
  const { run, busy } = useAction();
  useEffect(() => { if (q.data) setVals(Object.fromEntries(q.data.map((r) => [r.teacher_id, r.status ?? 'present']))); }, [q.data]);
  return (
    <Card title={<input type="date" className="input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />}
      actions={<button className="btn-primary" disabled={busy} onClick={() => run(() => api.post('/api/teachers/attendance', { date, entries: Object.entries(vals).map(([k, v]) => ({ teacherId: Number(k), status: v })) }))}>{t('Save')}</button>} bodyClass="p-0">
      <Async q={q}>{(rows) => (
        <table className="min-w-full text-sm"><tbody className="divide-y">{rows.map((r) => (
          <tr key={r.teacher_id}><td className="td">{fullName(r)} <span className="text-xs text-slate-500">{r.employee_code}</span>{!r.status && <span className="ml-2 text-xs text-amber-600">not marked</span>}</td>
            <td className="td"><div className="flex flex-wrap gap-1">{['present', 'absent', 'late', 'half_day', 'leave'].map((s) => (
              <button key={s} className={`rounded-md px-2 py-1 text-xs ${vals[r.teacher_id] === s ? 'bg-brand-600 text-white' : 'bg-slate-100'}`} onClick={() => setVals({ ...vals, [r.teacher_id]: s })}>{s.replace('_', '-')}</button>))}</div></td></tr>
        ))}</tbody></table>
      )}</Async>
    </Card>
  );
}

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Async, Badge, Card, DeleteButton, Field, FileInput, Modal, PageHeader, StatusBadge, useAction, useApi, useUi } from '../../components/ui';
import { CredentialsModal, SetPasswordModal } from '../../components/Credentials';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { useLookups } from '../../lib/lookups';
import { fmtDate, fullName, inr, todayISO } from '../../lib/format';

export default function StudentProfile() {
  const { id } = useParams();
  const nav = useNavigate();
  const { t } = useI18n();
  const { can, user } = useAuth();
  const q = useApi<any>(`/api/students/${id}`);
  const att = useApi<any>(`/api/attendance/student/${id}`);
  const { confirm } = useUi();
  const { run } = useAction();
  const [creds, setCreds] = useState<any>(null);
  const [editEnr, setEditEnr] = useState<any>(null);
  const [plansFor, setPlansFor] = useState<any>(null);
  const [withdraw, setWithdraw] = useState(false);
  const [readmit, setReadmit] = useState(false);
  const [setPw, setSetPw] = useState(false);
  const manage = can('students.manage');
  const base = user?.role === 'teacher' ? '/teacher' : '/admin';
  return (
    <Async q={q}>{(s) => {
      const cur = s.enrollments.find((e: any) => e.is_current);
      return (
        <>
          <PageHeader back={base === '/admin' ? '/admin/students' : '/teacher/classes'}
            title={<span className="flex items-center gap-3">{s.photo_file_id && <img src={`/api/files/${s.photo_file_id}`} alt="" className="h-12 w-12 rounded-full object-cover" />}{fullName(s)} {s.name_hi && <span className="text-base font-normal text-slate-500">({s.name_hi})</span>}</span>}
            subtitle={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{s.student_code}</span> · {t('Admission No.')} {s.admission_no} <StatusBadge status={s.status} /></span>}
            actions={manage && <>
              <Link to={`/admin/students/${id}/edit`} className="btn-secondary">{t('Edit')}</Link>
              <Link to={`/admin/students/${id}/admission-card`} className="btn-secondary">Admission card</Link>
              {can('fees.view') && <Link to={`/admin/students/${id}/fee-card`} className="btn-secondary">Fee card</Link>}
              {can('fees.view') && <Link to={`/admin/fees/student/${id}`} className="btn-secondary">{t('Fee statement')}</Link>}
              <button className="btn-secondary" onClick={() => setSetPw(true)}>Set password</button>
              <button className="btn-secondary" onClick={async () => {
                if (await confirm({ title: 'Reset password', message: 'Issue a new temporary password? The student will be signed out.' })) {
                  const r = await run(() => api.post(`/api/students/${id}/reset-password`), { success: false });
                  if (r) setCreds({ ...r, name: fullName(s) });
                }
              }}>Temporary password</button>
              <DeleteButton className="btn-ghost text-red-600" url={`/api/students/${id}`} what={`Student ${fullName(s)}`} onDone={() => nav('/admin/students')} />
              {s.status === 'active' ? <button className="btn-danger" onClick={() => setWithdraw(true)}>Withdraw / Transfer</button> : <button className="btn-primary" onClick={() => setReadmit(true)}>Re-admit</button>}
            </>} />
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Profile" className="lg:col-span-2">
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {[[t('Date of Birth'), fmtDate(s.dob)], [t('Gender'), s.gender ?? '—'], ['Blood group', s.blood_group ?? '—'], ['Admission date', fmtDate(s.admission_date)],
                  [t('Address'), s.address ?? '—'], ['Emergency contact', [s.emergency_contact_name, s.emergency_contact_phone].filter(Boolean).join(' · ') || '—'],
                  ['Previous school', [s.previous_school, s.previous_class].filter(Boolean).join(' · ') || '—'], ...(s.username ? [['Login ID', s.username + (s.login_active ? '' : ' (inactive)')]] : []),
                ].map(([k, v]) => <div key={k as string}><dt className="text-xs uppercase text-slate-500">{k}</dt><dd className="mt-0.5">{v}</dd></div>)}
              </dl>
            </Card>
            <Card title={t('Parent / Guardian')}>
              <ul className="space-y-3 text-sm">{s.guardians.map((g: any) => (
                <li key={g.id}><p className="font-medium">{g.name} <span className="text-slate-500">({g.relation})</span> {g.is_primary && <Badge tone="blue">Primary</Badge>}</p>
                  {g.phone && <p><a className="link" href={`tel:${g.phone}`}>{g.phone}</a></p>}{g.email && <p className="text-slate-600">{g.email}</p>}</li>))}</ul>
            </Card>
          </div>

          <Card title="Academic history" className="mt-4" bodyClass="p-0">
            <div className="overflow-x-auto"><table className="min-w-full text-sm">
              <thead className="bg-slate-50"><tr><th className="th">{t('Academic Year')}</th><th className="th">{t('Class')}</th><th className="th">{t('Roll No.')}</th><th className="th">{t('Board')} / {t('Medium')}</th><th className="th">Residency</th><th className="th">{t('Transport')}</th><th className="th">{t('Fee Plans')}</th><th className="th">{t('Status')}</th>{manage && <th className="th" />}</tr></thead>
              <tbody className="divide-y">{s.enrollments.map((e: any) => (
                <tr key={e.id}><td className="td">{e.year_name}</td><td className="td">{e.class_name} – {e.section_name}</td><td className="td">{e.roll_no}</td><td className="td">{e.board ?? '—'} / {e.medium ?? '—'}</td>
                  <td className="td">{e.residency === 'hostel' ? t('Hostel resident') : t('Day scholar')}</td><td className="td">{e.transport_opted ? e.route_name : t('No')}</td>
                  <td className="td text-xs">{(e.fee_plans ?? []).map((p: any) => p.name).join(', ') || '—'}</td><td className="td"><StatusBadge status={e.status} /></td>
                  {manage && <td className="td whitespace-nowrap">{e.status === 'active' && <><button className="link mr-3" onClick={() => setEditEnr(e)}>{t('Edit')}</button><button className="link" onClick={() => setPlansFor(e)}>{t('Fee Plans')}</button></>}</td>}
                </tr>))}</tbody>
            </table></div>
          </Card>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card title={t('Attendance')}>
              {att.data ? (
                <div className="text-sm">
                  <p className="text-3xl font-semibold">{att.data.overall.percent ?? '—'}{att.data.overall.percent != null && '%'}</p>
                  <p className="text-slate-500">{att.data.overall.present} {t('Present')} · {att.data.overall.absent} {t('Absent')} · {att.data.overall.leave} {t('Leave')}</p>
                  <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto">{att.data.monthly.map((m: any) => <li key={m.month} className="flex justify-between"><span>{m.month}</span><span>{m.percent ?? '—'}%</span></li>)}</ul>
                </div>
              ) : '…'}
            </Card>
            {s.fees && (
              <Card title={t('Fees')} actions={<Link className="link text-sm" to={`${base}/fees/student/${id}`}>{t('Fee statement')}</Link>}>
                <p className={`text-2xl font-semibold ${s.fees.outstanding > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{s.fees.cleared ? t('Fees Cleared') : inr(s.fees.outstanding)}</p>
                <p className="text-sm text-slate-500">Billed {inr(s.fees.billed)} · {t('Paid')} {inr(s.fees.paid)}{s.fees.overdue > 0 && <> · <span className="text-red-600">{t('Overdue')} {inr(s.fees.overdue)}</span></>}</p>
                {can('fees.collect') && s.fees.outstanding > 0 && <Link to={`/admin/fees/collect?studentId=${id}`} className="btn-primary btn-sm mt-3">{t('Collect Fee')}</Link>}
              </Card>
            )}
            <Card title={t('Hostel')}>
              {s.hostel ? <p className="text-sm">{s.hostel.hostel_name}, Room {s.hostel.room_no}, Bed {s.hostel.bed_no}<br /><span className="text-slate-500">Since {fmtDate(s.hostel.check_in)}</span></p> : <p className="text-sm text-slate-500">{cur?.residency === 'hostel' ? 'Hostel resident – no bed allocated yet.' : t('Day scholar')}</p>}
            </Card>
          </div>
          {(can('students.view_all') || manage) && (
            <Card title="Documents" className="mt-4" actions={manage && <FileInput purpose="student_document" accept="application/pdf,image/jpeg,image/png" label="Add document"
              onUploaded={(f) => run(() => api.post(`/api/students/${id}/documents`, { fileId: f.id, docType: 'Other' }))} />}>
              <ul className="divide-y text-sm">{s.documents.map((d: any) => <li key={d.id} className="flex justify-between py-2"><a className="link" href={`/api/files/${d.file_id}`} target="_blank" rel="noreferrer">{d.original_name}</a><span className="text-slate-500">{d.doc_type} · {fmtDate(d.created_at)}</span></li>)}
                {!s.documents.length && <li className="py-2 text-slate-500">—</li>}</ul>
            </Card>
          )}
          {editEnr && <EnrollmentModal studentId={s.id} e={editEnr} onClose={() => setEditEnr(null)} />}
          {plansFor && <PlansModal studentId={s.id} e={plansFor} onClose={() => setPlansFor(null)} />}
          {withdraw && <WithdrawModal studentId={s.id} onClose={() => setWithdraw(false)} />}
          {readmit && <ReadmitModal studentId={s.id} onClose={() => setReadmit(false)} />}
          {setPw && <SetPasswordModal url={`/api/students/${id}/set-password`} name={fullName(s)} onClose={() => setSetPw(false)} onDone={(c) => { setSetPw(false); setCreds(c); }} />}
          <CredentialsModal creds={creds} onClose={() => setCreds(null)} />
        </>
      );
    }}</Async>
  );
}

function EnrollmentFields({ v, set, yearId }: { v: any; set: (v: any) => void; yearId: number }) {
  const { t } = useI18n();
  const { lk, sectionsFor, sectionLabel } = useLookups();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={`${t('Class')} / ${t('Section')}`}><select className="input" value={v.sectionId} onChange={(e) => set({ ...v, sectionId: e.target.value, rollNo: '' })}>
        <option value="">—</option>{sectionsFor(yearId).map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}</select></Field>
      <Field label={t('Roll No.')} hint="Leave empty to assign the next number."><input className="input" type="number" min={1} value={v.rollNo} onChange={(e) => set({ ...v, rollNo: e.target.value })} /></Field>
      <Field label="Residency"><select className="input" value={v.residency} onChange={(e) => set({ ...v, residency: e.target.value })}><option value="day_scholar">{t('Day scholar')}</option><option value="hostel">{t('Hostel resident')}</option></select></Field>
      <Field label={t('Transport')}><select className="input" value={v.transportRouteId} onChange={(e) => set({ ...v, transportRouteId: e.target.value })}>
        <option value="">{t('No')}</option>{lk?.routes.filter((r) => r.is_active).map((r) => <option key={r.id} value={r.id}>{r.name} ({inr(r.monthly_fee_paise)})</option>)}</select></Field>
    </div>
  );
}

function EnrollmentModal({ studentId, e, onClose }: { studentId: number; e: any; onClose: () => void }) {
  const [v, setV] = useState({ sectionId: String(e.section_id), rollNo: String(e.roll_no), residency: e.residency, transportRouteId: e.transport_opted ? String(e.transport_route_id) : '', remarks: '' });
  const { run, busy } = useAction();
  return (
    <Modal open onClose={onClose} title="Edit enrollment" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button>
      <button className="btn-primary" disabled={busy} onClick={async () => {
        const r = await run(() => api.put(`/api/students/${studentId}/enrollments/${e.id}`, { sectionId: Number(v.sectionId), rollNo: v.rollNo || null, residency: v.residency,
          transportOpted: !!v.transportRouteId, transportRouteId: v.transportRouteId ? Number(v.transportRouteId) : null, remarks: v.remarks }));
        if (r) onClose();
      }}>Save</button></>}>
      <EnrollmentFields v={v} set={setV} yearId={e.academic_year_id} />
      <Field label="Remarks" className="mt-3"><input className="input" value={v.remarks} onChange={(x) => setV({ ...v, remarks: x.target.value })} /></Field>
      <p className="mt-3 text-xs text-slate-500">Changes apply to invoices generated from now on. Changing to day scholar removes the hostel fee plan.</p>
    </Modal>
  );
}

function PlansModal({ studentId, e, onClose }: { studentId: number; e: any; onClose: () => void }) {
  const plans = useApi<any[]>(`/api/fees/plans?yearId=${e.academic_year_id}`);
  const [ids, setIds] = useState<number[]>((e.fee_plans ?? []).map((p: any) => p.id));
  const { run, busy } = useAction();
  const ok = (p: any) => p.is_active && (!p.class_level_id || p.class_level_id === e.class_level_id) &&
    ((p.plan_type === 'preschool' && e.is_preschool) || (p.plan_type === 'school' && !e.is_preschool) || (p.plan_type === 'hostel' && e.residency === 'hostel'));
  return (
    <Modal open onClose={onClose} title="Assign fee plans" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button>
      <button className="btn-primary" disabled={busy} onClick={async () => { if (await run(() => api.put(`/api/students/${studentId}/enrollments/${e.id}/fee-plans`, { planIds: ids }))) onClose(); }}>Save</button></>}>
      <div className="space-y-2">{(plans.data ?? []).filter(ok).map((p) => (
        <label key={p.id} className="flex items-start gap-2 rounded-lg border p-3 text-sm">
          <input type="checkbox" className="mt-1" checked={ids.includes(p.id)} onChange={(x) => setIds(x.target.checked ? [...ids.filter((i) => plans.data!.find((q) => q.id === i)?.plan_type !== p.plan_type), p.id] : ids.filter((i) => i !== p.id))} />
          <span><b>{p.name}</b> <span className="text-xs uppercase text-slate-500">{p.plan_type}</span><span className="block text-xs text-slate-500">{p.items.map((i: any) => `${i.category_name} ${inr(i.amount_paise)} ${i.frequency}`).join(' · ')}</span></span>
        </label>))}
        {plans.data && !plans.data.filter(ok).length && <p className="text-sm text-slate-500">No applicable plans.</p>}
      </div>
    </Modal>
  );
}

function WithdrawModal({ studentId, onClose }: { studentId: number; onClose: () => void }) {
  const [v, setV] = useState({ status: 'withdrawn', date: todayISO(), reason: '' });
  const { run, busy } = useAction();
  return (
    <Modal open onClose={onClose} title="Withdraw or transfer student" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button>
      <button className="btn-danger" disabled={busy || v.reason.trim().length < 3} onClick={async () => { if (await run(() => api.post(`/api/students/${studentId}/withdraw`, v))) onClose(); }}>Confirm</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type"><select className="input" value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })}><option value="withdrawn">Withdrawn</option><option value="transferred">Transferred (TC issued)</option></select></Field>
        <Field label="Effective date"><input type="date" className="input" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Field>
        <Field label="Reason" required className="sm:col-span-2"><textarea className="input" rows={3} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} /></Field>
      </div>
      <p className="mt-3 text-sm text-slate-600">All records are kept. The student's login is deactivated and any hostel bed is released.</p>
    </Modal>
  );
}

function ReadmitModal({ studentId, onClose }: { studentId: number; onClose: () => void }) {
  const { current } = useLookups();
  const [v, setV] = useState({ sectionId: '', rollNo: '', residency: 'day_scholar', transportRouteId: '' });
  const { run, busy } = useAction();
  return (
    <Modal open onClose={onClose} title="Re-admit student" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button>
      <button className="btn-primary" disabled={busy || !v.sectionId} onClick={async () => {
        if (await run(() => api.post(`/api/students/${studentId}/readmit`, { sectionId: Number(v.sectionId), rollNo: v.rollNo || null, residency: v.residency, transportOpted: !!v.transportRouteId, transportRouteId: v.transportRouteId ? Number(v.transportRouteId) : null }))) onClose();
      }}>Re-admit</button></>}>
      {current && <EnrollmentFields v={v} set={setV} yearId={current.id} />}
      <p className="mt-3 text-xs text-slate-500">Assign fee plans afterwards from the academic history table.</p>
    </Modal>
  );
}

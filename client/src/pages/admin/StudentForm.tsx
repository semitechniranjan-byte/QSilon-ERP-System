import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { Card, Field, FileInput, Loading, Modal, PageHeader, useAction, useApi, useUi } from '../../components/ui';
import { CredentialsModal } from '../../components/Credentials';
import { useI18n } from '../../lib/i18n';
import { useLookups } from '../../lib/lookups';
import { fullName, inr, todayISO } from '../../lib/format';

const emptyGuardian = () => ({ id: null as number | null, name: '', relation: 'Father', phone: '', altPhone: '', email: '', occupation: '', address: '', isPrimary: false });

export default function StudentForm() {
  const { id } = useParams();
  const editing = !!id;
  const { t } = useI18n();
  const nav = useNavigate();
  const { toast } = useUi();
  const { lk, current, sectionsFor, sectionLabel } = useLookups();
  const existing = useApi<any>(editing ? `/api/students/${id}` : null);
  const [f, setF] = useState<any>({
    firstName: '', lastName: '', nameHi: '', dob: '', gender: '', bloodGroup: '', photoFileId: null, address: '',
    emergencyContactName: '', emergencyContactPhone: '', previousSchool: '', previousClass: '', admissionDate: todayISO(),
  });
  const [guardians, setGuardians] = useState([{ ...emptyGuardian(), isPrimary: true }]);
  const [yearId, setYearId] = useState<number | null>(null);
  const [enr, setEnr] = useState({ sectionId: '', rollNo: '', residency: 'day_scholar', transportOpted: false, transportRouteId: '' });
  const [planIds, setPlanIds] = useState<number[]>([]);
  const [docs, setDocs] = useState<{ fileId: string; docType: string; name: string }[]>([]);
  const [dupes, setDupes] = useState<any[] | null>(null);
  const [creds, setCreds] = useState<any>(null);
  const { run, busy, fieldErrors } = useAction();
  const [err, setErr] = useState<Record<string, string[]>>({});

  useEffect(() => { if (current && !yearId) setYearId(current.id); }, [current, yearId]);
  useEffect(() => {
    const s = existing.data;
    if (!s) return;
    setF({ firstName: s.first_name, lastName: s.last_name ?? '', nameHi: s.name_hi ?? '', dob: s.dob, gender: s.gender ?? '', bloodGroup: s.blood_group ?? '', photoFileId: s.photo_file_id,
      address: s.address ?? '', emergencyContactName: s.emergency_contact_name ?? '', emergencyContactPhone: s.emergency_contact_phone ?? '', previousSchool: s.previous_school ?? '',
      previousClass: s.previous_class ?? '', admissionDate: s.admission_date });
    setGuardians(s.guardians.map((g: any) => ({ id: g.id, name: g.name, relation: g.relation, phone: g.phone ?? '', altPhone: g.alt_phone ?? '', email: g.email ?? '', occupation: g.occupation ?? '', address: g.address ?? '', isPrimary: g.is_primary })));
  }, [existing.data]);

  const plans = useApi<any[]>(!editing && yearId ? `/api/fees/plans?yearId=${yearId}` : null);
  const section = sectionsFor(yearId).find((s) => String(s.id) === enr.sectionId);
  const applicablePlans = useMemo(() => (plans.data ?? []).filter((p) => p.is_active && section && (
    (p.plan_type === 'preschool' && section.is_preschool) || (p.plan_type === 'school' && !section.is_preschool) || (p.plan_type === 'hostel' && enr.residency === 'hostel')
  ) && (!p.class_level_id || p.class_level_id === section.class_level_id)), [plans.data, section, enr.residency]);
  useEffect(() => { setPlanIds((ids) => ids.filter((x) => applicablePlans.some((p) => p.id === x))); }, [applicablePlans]);
  useEffect(() => {
    if (!enr.sectionId || editing) return;
    api.get(`/api/students/next-roll/${enr.sectionId}`).then((r) => setEnr((e) => ({ ...e, rollNo: String(r.rollNo) }))).catch(() => {});
  }, [enr.sectionId, editing]);

  if (editing && existing.isLoading) return <Loading />;
  const set = (k: string, v: unknown) => setF((p: any) => ({ ...p, [k]: v }));
  const errors = { ...err, ...fieldErrors };
  const setG = (i: number, k: string, v: unknown) => setGuardians((gs) => gs.map((g, j) => (j === i ? { ...g, [k]: v } : k === 'isPrimary' && v ? { ...g, isPrimary: false } : g)));

  const submit = async (confirmDuplicate = false) => {
    setErr({});
    const body: any = { ...f, guardians };
    if (editing) {
      const r = await run(() => api.put(`/api/students/${id}`, body));
      if (r) nav(`/admin/students/${id}`);
      return;
    }
    if (!enr.sectionId) return toast('error', 'Choose a class and section.');
    const pickedType = (pt: string) => applicablePlans.find((p) => planIds.includes(p.id) && p.plan_type === pt);
    if (!pickedType('preschool') && !pickedType('school')) toast('error', 'No base fee plan selected — no tuition will be billed until one is assigned.');
    Object.assign(body, {
      enrollment: { sectionId: Number(enr.sectionId), rollNo: enr.rollNo || null, residency: enr.residency, transportOpted: enr.transportOpted, transportRouteId: enr.transportOpted ? Number(enr.transportRouteId) || null : null },
      feePlanIds: planIds, documents: docs.map(({ fileId, docType }) => ({ fileId, docType })), confirmDuplicate,
    });
    try {
      const r = await api.post('/api/students', body);
      setCreds({ username: r.username, temporaryPassword: r.temporaryPassword, name: fullName({ first_name: f.firstName, last_name: f.lastName }), studentId: r.student.id });
    } catch (e) {
      if (e instanceof ApiError && e.details?.code === 'POSSIBLE_DUPLICATE') return setDupes(e.details.matches);
      if (e instanceof ApiError && e.fields) setErr(e.fields);
      toast('error', (e as Error).message);
    }
  };

  return (
    <>
      <PageHeader title={editing ? `${t('Edit')}: ${fullName(existing.data)}` : t('Admissions')} back={editing ? `/admin/students/${id}` : '/admin/students'} />
      <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); submit(false); }}>
        <Card title="Student details">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="First name" required error={errors.firstName}><input className="input" required value={f.firstName} onChange={(e) => set('firstName', e.target.value)} /></Field>
            <Field label="Last name" error={errors.lastName}><input className="input" value={f.lastName} onChange={(e) => set('lastName', e.target.value)} /></Field>
            <Field label="Name in Hindi" error={errors.nameHi}><input className="input" lang="hi" value={f.nameHi} onChange={(e) => set('nameHi', e.target.value)} /></Field>
            <Field label={t('Date of Birth')} required error={errors.dob}><input type="date" className="input" required max={todayISO()} value={f.dob} onChange={(e) => set('dob', e.target.value)} /></Field>
            <Field label={t('Gender')} error={errors.gender}>
              <select className="input" value={f.gender} onChange={(e) => set('gender', e.target.value)}><option value="">—</option><option value="male">{t('Male')}</option><option value="female">{t('Female')}</option><option value="other">{t('Other')}</option></select>
            </Field>
            <Field label="Blood group" error={errors.bloodGroup}><input className="input" maxLength={5} value={f.bloodGroup} onChange={(e) => set('bloodGroup', e.target.value)} /></Field>
            <Field label="Admission date" error={errors.admissionDate}><input type="date" className="input" value={f.admissionDate} onChange={(e) => set('admissionDate', e.target.value)} /></Field>
            <Field label="Previous school" error={errors.previousSchool}><input className="input" value={f.previousSchool} onChange={(e) => set('previousSchool', e.target.value)} /></Field>
            <Field label="Previous class" error={errors.previousClass}><input className="input" value={f.previousClass} onChange={(e) => set('previousClass', e.target.value)} /></Field>
            <Field label={t('Address')} className="md:col-span-3" error={errors.address}><textarea className="input" rows={2} value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
            <Field label="Emergency contact name" error={errors.emergencyContactName}><input className="input" value={f.emergencyContactName} onChange={(e) => set('emergencyContactName', e.target.value)} /></Field>
            <Field label="Emergency contact phone" error={errors.emergencyContactPhone}><input className="input" inputMode="tel" value={f.emergencyContactPhone} onChange={(e) => set('emergencyContactPhone', e.target.value)} /></Field>
            <div>
              <span className="label">Photograph</span>
              <div className="flex items-center gap-3">
                {f.photoFileId && <img src={`/api/files/${f.photoFileId}`} alt="" className="h-14 w-14 rounded-lg object-cover" />}
                <FileInput purpose="student_photo" accept="image/jpeg,image/png,image/webp" label={f.photoFileId ? 'Replace' : 'Upload photo'} onUploaded={(x) => set('photoFileId', x.id)} />
              </div>
            </div>
          </div>
        </Card>

        <Card title={t('Parent / Guardian')} actions={guardians.length < 4 && <button type="button" className="btn-secondary btn-sm" onClick={() => setGuardians([...guardians, emptyGuardian()])}><Plus className="h-4 w-4" />{t('Add')}</button>}>
          <div className="space-y-4">
            {guardians.map((g, i) => (
              <div key={i} className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-4">
                <Field label={t('Name')} required><input className="input" required value={g.name} onChange={(e) => setG(i, 'name', e.target.value)} /></Field>
                <Field label="Relation" required>
                  <select className="input" value={g.relation} onChange={(e) => setG(i, 'relation', e.target.value)}>{['Father', 'Mother', 'Guardian', 'Grandparent', 'Sibling', 'Other'].map((r) => <option key={r}>{r}</option>)}</select>
                </Field>
                <Field label={t('Phone')}><input className="input" inputMode="tel" value={g.phone} onChange={(e) => setG(i, 'phone', e.target.value)} /></Field>
                <Field label={t('Email')}><input type="email" className="input" value={g.email} onChange={(e) => setG(i, 'email', e.target.value)} /></Field>
                <Field label="Alternate phone"><input className="input" inputMode="tel" value={g.altPhone} onChange={(e) => setG(i, 'altPhone', e.target.value)} /></Field>
                <Field label="Occupation"><input className="input" value={g.occupation} onChange={(e) => setG(i, 'occupation', e.target.value)} /></Field>
                <div className="flex items-end gap-3 md:col-span-2">
                  <label className="flex items-center gap-2 pb-2 text-sm"><input type="radio" name="primary" checked={g.isPrimary} onChange={() => setG(i, 'isPrimary', true)} />Primary contact</label>
                  {guardians.length > 1 && <button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => setGuardians(guardians.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" />Remove</button>}
                </div>
              </div>
            ))}
            {errors.guardians && <p className="text-sm text-red-600">{errors.guardians[0]}</p>}
          </div>
        </Card>

        {!editing && (
          <>
            <Card title="Class, residency & transport">
              <div className="grid gap-4 md:grid-cols-3">
                <Field label={t('Academic Year')}>
                  <select className="input" value={yearId ?? ''} onChange={(e) => { setYearId(Number(e.target.value)); setEnr({ ...enr, sectionId: '' }); }}>
                    {lk?.years.map((y) => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (current)' : ''}</option>)}
                  </select>
                </Field>
                <Field label={`${t('Class')} / ${t('Section')}`} required hint={section ? `${section.board ?? ''} ${section.medium ?? ''}` : undefined}>
                  <select className="input" required value={enr.sectionId} onChange={(e) => setEnr({ ...enr, sectionId: e.target.value })}>
                    <option value="">—</option>{sectionsFor(yearId).filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}
                  </select>
                </Field>
                <Field label={t('Roll No.')} hint="Suggested automatically; must be unique in the section."><input className="input" type="number" min={1} value={enr.rollNo} onChange={(e) => setEnr({ ...enr, rollNo: e.target.value })} /></Field>
                <Field label="Residency">
                  <select className="input" value={enr.residency} onChange={(e) => setEnr({ ...enr, residency: e.target.value })}><option value="day_scholar">{t('Day scholar')}</option><option value="hostel">{t('Hostel resident')}</option></select>
                </Field>
                <Field label={t('Transport required')}>
                  <select className="input" value={enr.transportOpted ? 'yes' : 'no'} onChange={(e) => setEnr({ ...enr, transportOpted: e.target.value === 'yes' })}><option value="no">{t('No')}</option><option value="yes">{t('Yes')}</option></select>
                </Field>
                {enr.transportOpted && (
                  <Field label="Transport route" required>
                    <select className="input" required value={enr.transportRouteId} onChange={(e) => setEnr({ ...enr, transportRouteId: e.target.value })}>
                      <option value="">—</option>{lk?.routes.filter((r) => r.is_active).map((r) => <option key={r.id} value={r.id}>{r.name} ({inr(r.monthly_fee_paise)}/month)</option>)}
                    </select>
                  </Field>
                )}
              </div>
            </Card>
            <Card title={t('Fee Plans')}>
              {!section ? <p className="text-sm text-slate-500">Choose a section to see applicable fee plans.</p> : (
                <div className="space-y-2">
                  {applicablePlans.map((p) => (
                    <label key={p.id} className="flex items-start gap-3 rounded-lg border p-3">
                      <input type="checkbox" className="mt-1" checked={planIds.includes(p.id)} onChange={(e) => setPlanIds(e.target.checked ? [...planIds.filter((x) => applicablePlans.find((q) => q.id === x)?.plan_type !== p.plan_type), p.id] : planIds.filter((x) => x !== p.id))} />
                      <span><span className="font-medium">{p.name}</span> <span className="text-xs uppercase text-slate-500">{p.plan_type}</span>
                        <span className="block text-xs text-slate-500">{p.items.map((i: any) => `${i.category_name} ${inr(i.amount_paise)} (${i.frequency.replace('_', ' ')})`).join(' · ')}</span></span>
                    </label>
                  ))}
                  {!applicablePlans.length && <p className="text-sm text-amber-700">No fee plan exists for this class. Create one under Fees → Fee Plans (you can assign it later).</p>}
                  {enr.transportOpted && <p className="text-xs text-slate-500">Transport is billed monthly from the selected route.</p>}
                </div>
              )}
            </Card>
            <Card title="Documents">
              <div className="space-y-2">
                {docs.map((d, i) => (
                  <div key={d.fileId} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{d.name}</span>
                    <select className="input w-48" value={d.docType} onChange={(e) => setDocs(docs.map((x, j) => (j === i ? { ...x, docType: e.target.value } : x)))}>
                      {['Birth certificate', 'Transfer certificate', 'Aadhaar', 'Report card', 'Photo', 'Other'].map((o) => <option key={o}>{o}</option>)}
                    </select>
                    <button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => setDocs(docs.filter((_, j) => j !== i))}>Remove</button>
                  </div>
                ))}
                <FileInput purpose="student_document" accept="application/pdf,image/jpeg,image/png" label="Attach document" onUploaded={(x) => setDocs([...docs, { fileId: x.id, docType: 'Birth certificate', name: x.name }])} />
                <p className="text-xs text-slate-500">PDF or image, up to 5 MB. Documents are stored privately and visible only to authorized office staff.</p>
              </div>
            </Card>
          </>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => nav(-1)}>{t('Cancel')}</button>
          <button className="btn-primary" disabled={busy}>{editing ? t('Save') : 'Admit student'}</button>
        </div>
      </form>

      <Modal open={!!dupes} onClose={() => setDupes(null)} title="Possible duplicate admission" footer={<>
        <button className="btn-secondary" onClick={() => setDupes(null)}>{t('Cancel')}</button>
        <button className="btn-danger" onClick={() => { setDupes(null); submit(true); }}>Admit anyway</button>
      </>}>
        <p className="mb-3 text-sm text-slate-600">These existing students have the same name and date of birth:</p>
        <ul className="divide-y rounded-lg border text-sm">{dupes?.map((d) => <li key={d.id} className="p-3"><a className="link" href={`/admin/students/${d.id}`} target="_blank" rel="noreferrer">{fullName(d)}</a> · {d.student_code} · {d.admission_no} · {d.status}</li>)}</ul>
      </Modal>
      <CredentialsModal creds={creds} onClose={() => { const sid = creds?.studentId; setCreds(null); nav(`/admin/students/${sid}`); }} />
    </>
  );
}

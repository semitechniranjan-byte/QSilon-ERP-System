import { useState } from 'react';
import { Async, Card, Field, Modal, PageHeader, StatusBadge, useAction, useApi } from '../../components/ui';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { fmtDate, fullName } from '../../lib/format';

const FIELDS = [['address', 'Address'], ['blood_group', 'Blood group'], ['emergency_contact_name', 'Emergency contact name'], ['emergency_contact_phone', 'Emergency contact phone'], ['name_hi', 'Name in Hindi'], ['other', 'Other (explain in reason)']];

export default function StudentSelf() {
  const { t, pick } = useI18n();
  const q = useApi<any>('/api/me/profile');
  const reqs = useApi<any[]>('/api/me/corrections');
  const [req, setReq] = useState<any>(null);
  const { run, busy } = useAction();
  return (
    <Async q={q}>{(d) => {
      const s = d.student, e = d.enrollment;
      return (
        <>
          <PageHeader title={t('My Profile')} actions={<button className="btn-secondary" onClick={() => setReq({ field: 'address', requestedValue: '', reason: '' })}>{t('Request correction')}</button>} />
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title={<span className="flex items-center gap-3">{s.photo_file_id && <img src={`/api/files/${s.photo_file_id}`} alt="" className="h-12 w-12 rounded-full object-cover" />}{fullName(s)}</span>} className="lg:col-span-2">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {[[t('Student ID'), s.student_code], [t('Admission No.'), s.admission_no], [t('Class'), e ? `${pick(e.class_name, e.class_name_hi)} – ${e.section_name}` : '—'], [t('Roll No.'), e?.roll_no],
                  [t('Academic Year'), e?.year_name], [`${t('Board')} / ${t('Medium')}`, e ? `${e.board_name ?? '—'} / ${e.medium_name ?? '—'}` : '—'], ['Class teacher', e?.class_teacher], [t('Date of Birth'), fmtDate(s.dob)],
                  ['Blood group', s.blood_group], [t('Address'), s.address], ['Emergency contact', [s.emergency_contact_name, s.emergency_contact_phone].filter(Boolean).join(' · ')],
                  ['Residency', e?.residency === 'hostel' ? t('Hostel resident') : t('Day scholar')], [t('Transport'), e?.transport_opted ? e.route_name : t('No')]]
                  .map(([k, v]) => <div key={k as string}><dt className="text-xs uppercase text-slate-500">{k}</dt><dd>{v || '—'}</dd></div>)}
              </dl>
              {d.hostel && <p className="mt-4 rounded-lg bg-violet-50 p-3 text-sm">{t('Hostel')}: {d.hostel.hostel_name}, Room {d.hostel.room_no}, Bed {d.hostel.bed_no} · Warden {d.hostel.warden_name ?? '—'} {d.hostel.emergency_phone ? `· Emergency ${d.hostel.emergency_phone}` : ''}</p>}
            </Card>
            <Card title={t('Parent / Guardian')}><ul className="space-y-2 text-sm">{d.guardians.map((g: any, i: number) => <li key={i}><b>{g.name}</b> ({g.relation})<br />{g.phone}</li>)}</ul></Card>
            <Card title={t('Subjects')}><ul className="divide-y text-sm">{d.subjects.map((x: any) => <li key={x.id} className="flex justify-between py-1.5"><span>{pick(x.name, x.name_hi)}{x.is_optional && ' (optional)'}</span><span className="text-slate-500">{x.teacher ?? ''}</span></li>)}</ul></Card>
            <Card title="Class history"><ul className="divide-y text-sm">{d.history.map((h: any, i: number) => <li key={i} className="flex justify-between py-1.5"><span>{h.year_name} · {h.class_name} – {h.section_name}</span><StatusBadge status={h.status} /></li>)}</ul></Card>
            <Card title="Correction requests"><ul className="divide-y text-sm">{reqs.data?.map((r) => <li key={r.id} className="py-1.5"><p>{r.field.replace(/_/g, ' ')} → <b>{r.requested_value}</b> <StatusBadge status={r.status} /></p>{r.response && <p className="text-xs text-slate-500">{r.response}</p>}</li>)}{!reqs.data?.length && <li className="py-1.5 text-slate-500">—</li>}</ul></Card>
          </div>
          {req && (
            <Modal open onClose={() => setReq(null)} title={t('Request correction')} footer={<><button className="btn-secondary" onClick={() => setReq(null)}>{t('Cancel')}</button>
              <button className="btn-primary" disabled={busy || !req.requestedValue} onClick={async () => { if (await run(() => api.post('/api/me/corrections', req), { success: 'Request sent to the school office.' })) setReq(null); }}>{t('Submit')}</button></>}>
              <div className="grid gap-3">
                <Field label="Field"><select className="input" value={req.field} onChange={(e) => setReq({ ...req, field: e.target.value })}>{FIELDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
                <Field label="Correct value"><input className="input" value={req.requestedValue} onChange={(e) => setReq({ ...req, requestedValue: e.target.value })} /></Field>
                <Field label="Reason"><textarea className="input" rows={2} value={req.reason} onChange={(e) => setReq({ ...req, reason: e.target.value })} /></Field>
                <p className="text-xs text-slate-500">Name, date of birth, class and other official details can only be changed by the school office after verification.</p>
              </div>
            </Modal>
          )}
        </>
      );
    }}</Async>
  );
}

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { Field } from '../../components/ui';
import { usePublicSite } from '../../components/PublicLayout';
import { Paragraphs } from './Home';

export function EnquiryForm({ classes }: { classes: any[] }) {
  const { t, pick } = useI18n();
  const [f, setF] = useState({ studentName: '', dob: '', classSought: '', parentName: '', phone: '', email: '', message: '', needsHostel: false, needsTransport: false, website: '' });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  if (done) return <div className="flex items-start gap-3 rounded-lg bg-emerald-50 p-4 text-emerald-800" role="status"><CheckCircle2 className="h-5 w-5" />{t('Thank you! The school office will contact you soon.')}</div>;
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr(''); setErrors({});
      try { await api.post('/api/public/enquiry', f); setDone(true); } catch (x: any) { setErr(x.message); setErrors(x.fields ?? {}); } finally { setBusy(false); }
    }}>
      <Field label={t('Child’s name')} required error={errors.studentName}><input className="input" required value={f.studentName} onChange={(e) => set('studentName', e.target.value)} /></Field>
      <Field label={t('Date of Birth')} error={errors.dob}><input type="date" className="input" value={f.dob} onChange={(e) => set('dob', e.target.value)} /></Field>
      <Field label={t('Class sought')} required error={errors.classSought}>
        <select className="input" required value={f.classSought} onChange={(e) => set('classSought', e.target.value)}>
          <option value="">—</option>{classes.map((c) => <option key={c.id} value={c.name}>{pick(c.name, c.name_hi)}</option>)}
        </select>
      </Field>
      <Field label={t('Parent’s name')} required error={errors.parentName}><input className="input" required value={f.parentName} onChange={(e) => set('parentName', e.target.value)} /></Field>
      <Field label={t('Phone')} required error={errors.phone}><input className="input" required inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
      <Field label={t('Email')} error={errors.email}><input type="email" className="input" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
      <Field label={t('Message')} className="sm:col-span-2" error={errors.message}><textarea className="input" rows={3} value={f.message} onChange={(e) => set('message', e.target.value)} /></Field>
      <div className="flex flex-wrap gap-4 text-sm sm:col-span-2">
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.needsHostel} onChange={(e) => set('needsHostel', e.target.checked)} />{t('Hostel required')}</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.needsTransport} onChange={(e) => set('needsTransport', e.target.checked)} />{t('Transport required')}</label>
      </div>
      {/* Honeypot field: hidden from people, filled by bots */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" value={f.website} onChange={(e) => set('website', e.target.value)} aria-hidden />
      {err && <p className="text-sm text-red-600 sm:col-span-2" role="alert">{err}</p>}
      <div className="sm:col-span-2"><button className="btn-primary" disabled={busy}>{t('Send enquiry')}</button></div>
    </form>
  );
}

export default function EnquiryPage() {
  const { t, pick } = useI18n();
  const { data } = usePublicSite();
  const page = data?.pages.find((p) => p.key === 'admissions');
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-brand-900">{t('Admission Enquiry')}</h1>
      {page?.body && <Paragraphs text={pick(page.body, page.body_hi)} className="mt-4 text-slate-600" />}
      <div className="card mt-8 p-6">
        {data && (data.school.enquiryEnabled ? <EnquiryForm classes={data.classes} /> : <p className="text-slate-600">Online enquiries are currently closed. Please contact the school office.</p>)}
      </div>
    </div>
  );
}

import { useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { Async, PageHeader, useApi } from '../../components/ui';
import { PrintHeader, Signatures } from '../../components/PrintHeader';
import { useI18n } from '../../lib/i18n';
import { fmtDate, fullName, titleCase } from '../../lib/format';

/** Printable admission card / admission record for one student. */
export default function AdmissionCard() {
  const { id } = useParams();
  const { t, pick } = useI18n();
  const q = useApi<any>(`/api/students/${id}`);
  return (
    <Async q={q}>{(s) => {
      const e = s.enrollments.find((x: any) => x.is_current) ?? s.enrollments[0];
      const g = s.guardians;
      const row = (k: string, v: any) => <tr key={k}><th className="w-44 border border-slate-300 bg-slate-50 px-3 py-1.5 text-left text-xs font-semibold text-slate-600">{k}</th><td className="border border-slate-300 px-3 py-1.5">{v || '—'}</td></tr>;
      return (
        <>
          <PageHeader title={`${t('Admission card')} – ${fullName(s)}`} back={`/admin/students/${id}`} actions={<button className="btn-primary" onClick={() => window.print()}><Printer className="h-4 w-4" />{t('Print')}</button>} />
          <article className="print-area card mx-auto max-w-3xl bg-white p-6 text-sm sm:p-8">
            <PrintHeader title="ADMISSION CARD" titleHi="प्रवेश पत्र" />
            <div className="mt-5 flex gap-5">
              <table className="w-full border-collapse"><tbody>
                {row(t('Student ID'), <b className="font-mono">{s.student_code}</b>)}
                {row(t('Admission No.'), <b>{s.admission_no}</b>)}
                {row('Admission date', fmtDate(s.admission_date))}
                {row(t('Name'), <b>{fullName(s)}{s.name_hi ? ` (${s.name_hi})` : ''}</b>)}
                {row(t('Date of Birth'), fmtDate(s.dob))}
                {row(t('Gender'), titleCase(s.gender))}
              </tbody></table>
              <div className="flex h-36 w-28 shrink-0 items-center justify-center overflow-hidden border border-slate-300 text-center text-[10px] text-slate-400">
                {s.photo_file_id ? <img src={`/api/files/${s.photo_file_id}`} alt="" className="h-full w-full object-cover" /> : 'Paste photograph'}
              </div>
            </div>
            <h3 className="mb-1 mt-5 text-xs font-bold uppercase tracking-wider text-brand-700">Class details</h3>
            <table className="w-full border-collapse"><tbody>
              {row(t('Academic Year'), e?.year_name)}
              {row(`${t('Class')} / ${t('Section')}`, e ? `${pick(e.class_name, e.class_name_hi)} – ${e.section_name}` : '')}
              {row(t('Roll No.'), <b>{e?.roll_no}</b>)}
              {row(`${t('Board')} / ${t('Medium')}`, e ? `${e.board ?? '—'} / ${e.medium ?? '—'}` : '')}
              {row('Residency', e?.residency === 'hostel' ? t('Hostel resident') : t('Day scholar'))}
              {row(t('Transport'), e?.transport_opted ? e.route_name : t('No'))}
              {row(t('Fee Plans'), (e?.fee_plans ?? []).map((p: any) => p.name).join(', '))}
            </tbody></table>
            <h3 className="mb-1 mt-5 text-xs font-bold uppercase tracking-wider text-brand-700">{t('Parent / Guardian')}</h3>
            <table className="w-full border-collapse"><tbody>
              {g.map((x: any) => row(`${x.relation}${x.is_primary ? ' (primary)' : ''}`, [x.name, x.phone, x.email, x.occupation].filter(Boolean).join(' · ')))}
              {row(t('Address'), s.address)}
              {row('Emergency contact', [s.emergency_contact_name, s.emergency_contact_phone].filter(Boolean).join(' · '))}
              {row('Previous school', [s.previous_school, s.previous_class].filter(Boolean).join(' · '))}
              {row('Blood group', s.blood_group)}
            </tbody></table>
            <p className="mt-4 text-xs text-slate-500">Student portal login: ID <b className="font-mono">{s.student_code}</b> at {location.origin}/login</p>
            <Signatures labels={['Parent / Guardian', 'Admission In-charge', 'Principal']} />
          </article>
        </>
      );
    }}</Async>
  );
}

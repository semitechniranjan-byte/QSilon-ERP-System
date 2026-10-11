import { Async, Card, PageHeader, useApi } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { fmtDate, fullName } from '../../lib/format';

export default function TeacherSelf() {
  const { t } = useI18n();
  const q = useApi<any>('/api/teachers/self/profile');
  return (
    <Async q={q}>{(p) => (
      <>
        <PageHeader title={t('My Profile')} subtitle={p.employee_code} />
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={fullName(p)}>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">{[[t('Phone'), p.phone], [t('Email'), p.email], ['Qualification', p.qualification], ['Designation', p.designation], ['Joining date', fmtDate(p.joining_date)], [t('Address'), p.address]].map(([k, v]) => <div key={k}><dt className="text-xs uppercase text-slate-500">{k}</dt><dd>{v || '—'}</dd></div>)}</dl>
            <p className="mt-4 text-xs text-slate-500">To correct your details, contact the school office.</p>
          </Card>
          <Card title={t('Assigned classes')}><ul className="divide-y text-sm">{p.assignments.map((a: any) => <li key={a.id} className="py-2">{a.class_name} – {a.section} · {a.subject}</li>)}{!p.assignments.length && <li className="py-2 text-slate-500">—</li>}</ul></Card>
        </div>
      </>
    )}</Async>
  );
}

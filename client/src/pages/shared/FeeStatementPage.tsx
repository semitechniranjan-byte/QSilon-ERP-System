import { Link, useParams } from 'react-router-dom';
import { Async, PageHeader, useApi } from '../../components/ui';
import { FeeStatement } from '../../components/FeeStatement';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { fullName } from '../../lib/format';

export default function FeeStatementPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const { user, can } = useAuth();
  const q = useApi<any>(`/api/fees/students/${id}/statement`);
  const base = user?.role === 'teacher' ? '/teacher' : '/admin';
  return (
    <Async q={q}>{(d) => (
      <>
        <PageHeader back={base === '/admin' ? `/admin/students/${id}` : undefined} title={`${t('Fee statement')}: ${fullName(d.student)}`}
          subtitle={`${d.student.student_code} · ${d.student.class_name ?? ''} ${d.student.section_name ?? ''} · ${d.student.residency === 'hostel' ? t('Hostel resident') : t('Day scholar')}${d.student.transport_opted ? ` · ${t('Transport')}: ${d.student.route_name}` : ''}`}
          actions={<>{can('fees.collect') && <Link to={`/admin/fees/collect?studentId=${id}`} className="btn-primary">{t('Collect Fee')}</Link>}<button className="btn-secondary" onClick={() => window.print()}>{t('Print')}</button></>} />
        <FeeStatement data={d} receiptBase={`${base}/fees/receipts`} />
      </>
    )}</Async>
  );
}

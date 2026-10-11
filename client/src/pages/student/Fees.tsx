import { Async, PageHeader, useApi } from '../../components/ui';
import { FeeStatement } from '../../components/FeeStatement';
import { useI18n } from '../../lib/i18n';

export default function StudentFees() {
  const { t } = useI18n();
  const q = useApi<any>('/api/me/fees');
  return (
    <>
      <PageHeader title={t('My Fees')} subtitle="Payments are recorded only by the school office. Contact the office for any discrepancy." />
      <Async q={q}>{(d) => <FeeStatement data={d} receiptBase="/student/fees/receipts" />}</Async>
    </>
  );
}

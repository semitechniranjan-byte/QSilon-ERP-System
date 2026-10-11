import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Async, Card, PageHeader, StatusBadge, useApi } from '../../../components/ui';
import { DataTable } from '../../../components/DataTable';
import { qs } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import { fmtDate, fullName, inr } from '../../../lib/format';

export default function Receipts() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { user } = useAuth();
  const [f, setF] = useState({ search: '', from: '', to: '' });
  const [applied, setApplied] = useState(f);
  const q = useApi<any[]>(`/api/fees/receipts${qs(applied)}`);
  const base = user?.role === 'teacher' ? '/teacher' : '/admin';
  return (
    <>
      <PageHeader title={t('Receipts')} actions={<a className="btn-secondary" href={`/api/reports/collections${qs({ format: 'xlsx', from: applied.from, to: applied.to })}`}><Download className="h-4 w-4" />{t('Export Excel')}</a>} />
      <Card bodyClass="p-0">
        <form className="grid gap-2 border-b p-3 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); setApplied(f); }}>
          <input className="input md:col-span-2" placeholder="Receipt no., student ID, admission no., roll no. or name" value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })} aria-label={t('Search')} />
          <input type="date" className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} aria-label="From" />
          <div className="flex gap-2"><input type="date" className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label="To" /><button className="btn-primary">{t('Search')}</button></div>
        </form>
        <Async q={q}>{(rows) => (
          <DataTable rows={rows} onRowClick={(r) => nav(`${base}/fees/receipts/${r.id}`)} columns={[
            { key: 'receipt_no', header: 'Receipt', render: (r) => <span className="font-mono text-xs">{r.receipt_no}</span>, sortValue: (r) => r.receipt_no },
            { key: 'paid_on', header: t('Date'), render: (r) => fmtDate(r.paid_on), sortValue: (r) => r.paid_on },
            { key: 'student', header: t('Students'), render: (r) => <span>{fullName(r)} <span className="text-xs text-slate-500">{r.student_code}</span></span>, sortValue: fullName },
            { key: 'class', header: t('Class'), render: (r) => `${r.class_name ?? ''} ${r.section_name ?? ''} · ${r.roll_no ?? ''}` },
            { key: 'amount_paise', header: t('Amount'), className: 'text-right', render: (r) => inr(r.amount_paise), sortValue: (r) => r.amount_paise },
            { key: 'mode', header: 'Mode', render: (r) => r.mode.replace('_', ' ') },
            { key: 'status', header: t('Status'), render: (r) => <StatusBadge status={r.status} /> },
            { key: 'print_count', header: 'Prints', className: 'text-right' },
          ]} />
        )}</Async>
      </Card>
    </>
  );
}

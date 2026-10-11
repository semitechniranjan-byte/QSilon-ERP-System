import { useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { Async, PageHeader, useApi } from '../../components/ui';
import { PrintHeader, Signatures } from '../../components/PrintHeader';
import { useI18n } from '../../lib/i18n';
import { fmtDate, fullName, inr } from '../../lib/format';

const FREQ: Record<string, string> = { one_time: 'One-time', monthly: 'Monthly', quarterly: 'Quarterly', half_yearly: 'Half-yearly', annual: 'Annual' };

/** Printable fee card: fee structure, month-wise dues and payment record. */
export default function FeeCard() {
  const { id } = useParams();
  const { t, pick } = useI18n();
  const q = useApi<any>(`/api/fees/students/${id}/statement`);
  return (
    <Async q={q}>{(d) => {
      const s = d.student;
      const b = d.balance;
      const cell = 'border border-slate-300 px-2 py-1.5';
      return (
        <>
          <PageHeader title={`Fee card – ${fullName(s)}`} back={`/admin/students/${id}`} actions={<button className="btn-primary" onClick={() => window.print()}><Printer className="h-4 w-4" />{t('Print')}</button>} />
          <article className="print-area card mx-auto max-w-3xl bg-white p-6 text-sm sm:p-8">
            <PrintHeader title="FEE CARD" titleHi="शुल्क कार्ड" />
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1">
              {[[t('Name'), fullName(s)], [t('Student ID'), s.student_code], [t('Admission No.'), s.admission_no], [t('Roll No.'), s.roll_no],
                [t('Class'), `${s.class_name ?? '—'} – ${s.section_name ?? ''}`], [t('Academic Year'), s.year_name],
                ['Residency', s.residency === 'hostel' ? t('Hostel resident') : t('Day scholar')], [t('Transport'), s.transport_opted ? s.route_name : t('No')]]
                .map(([k, v]) => <div key={k as string} className="flex gap-2"><span className="w-28 text-slate-500">{k}</span><b>{v ?? '—'}</b></div>)}
            </div>
            <h3 className="mb-1 mt-5 text-xs font-bold uppercase tracking-wider text-brand-700">Fee structure</h3>
            <table className="w-full border-collapse"><thead className="bg-slate-50"><tr><th className={`${cell} text-left`}>Fee</th><th className={`${cell} text-left`}>Billing</th><th className={`${cell} text-right`}>{t('Amount')}</th></tr></thead>
              <tbody>{d.structure.map((r: any, i: number) => <tr key={i}><td className={cell}>{pick(r.category, r.category_hi)}{r.plan_type === 'hostel' ? ' (hostel)' : ''}</td><td className={cell}>{FREQ[r.frequency]}</td><td className={`${cell} text-right`}>{inr(r.amount_paise)}</td></tr>)}
                {d.route && <tr><td className={cell}>{t('Transport')} – {d.route.name}</td><td className={cell}>Monthly</td><td className={`${cell} text-right`}>{inr(d.route.monthly_fee_paise)}</td></tr>}
                {!d.structure.length && !d.route && <tr><td className={cell} colSpan={3}>No fee plan assigned yet.</td></tr>}</tbody></table>
            <h3 className="mb-1 mt-5 text-xs font-bold uppercase tracking-wider text-brand-700">Month-wise dues</h3>
            <table className="w-full border-collapse"><thead className="bg-slate-50"><tr>{['Period', 'Due date', t('Amount'), t('Paid'), t('Balance')].map((h, i) => <th key={h} className={`${cell} ${i > 1 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
              <tbody>{d.invoices.map((inv: any) => <tr key={inv.id}><td className={cell}>{inv.period_label}</td><td className={cell}>{fmtDate(inv.due_date)}</td><td className={`${cell} text-right`}>{inr(inv.net_paise)}</td>
                <td className={`${cell} text-right`}>{inr(inv.paid_paise + inv.adjusted_paise)}</td><td className={`${cell} text-right font-semibold`}>{inv.outstanding_paise ? inr(inv.outstanding_paise) : '✓'}</td></tr>)}
                {!d.invoices.length && <tr><td className={cell} colSpan={5}>No dues billed yet.</td></tr>}</tbody></table>
            <h3 className="mb-1 mt-5 text-xs font-bold uppercase tracking-wider text-brand-700">{t('Payment history')}</h3>
            <table className="w-full border-collapse"><thead className="bg-slate-50"><tr>{[t('Date'), 'Receipt No.', 'Mode', t('Amount')].map((h, i) => <th key={h} className={`${cell} ${i === 3 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
              <tbody>{d.payments.filter((p: any) => p.status === 'completed').map((p: any) => <tr key={p.id}><td className={cell}>{fmtDate(p.paid_on)}</td><td className={cell}>{p.receipt_no}</td><td className={cell}>{p.mode.replace('_', ' ')}</td><td className={`${cell} text-right`}>{inr(p.amount_paise)}</td></tr>)}
                {!d.payments.length && <tr><td className={cell} colSpan={4}>No payments yet.</td></tr>}</tbody></table>
            <div className="mt-4 flex flex-wrap justify-end gap-6 text-sm"><span>Billed: <b>{inr(b.billed)}</b></span><span>{t('Paid')}: <b>{inr(b.paid)}</b></span>
              <span className={b.outstanding ? 'text-amber-700' : 'text-emerald-700'}>{b.cleared ? <b>✓ {t('Fees Cleared')}</b> : <>{t('Balance')}: <b>{inr(b.outstanding)}</b></>}</span></div>
            <Signatures labels={['Parent / Guardian', 'Accounts', 'Principal']} />
          </article>
        </>
      );
    }}</Async>
  );
}

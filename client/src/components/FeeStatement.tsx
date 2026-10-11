import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge, Card, Field, Modal, StatusBadge, useAction, useUi } from './ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { fmtDate, inr, paiseToRupeeStr } from '../lib/format';

export function BalanceSummary({ b }: { b: any }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <div className="card p-4"><p className="text-xs uppercase text-slate-500">Billed</p><p className="text-xl font-semibold">{inr(b.billed)}</p>{b.discount > 0 && <p className="text-xs text-slate-500">after {inr(b.discount)} concession</p>}</div>
      <div className="card p-4"><p className="text-xs uppercase text-slate-500">{t('Paid')}</p><p className="text-xl font-semibold text-emerald-700">{inr(b.paid)}</p>{b.adjusted > 0 && <p className="text-xs text-slate-500">+ {inr(b.adjusted)} waived</p>}</div>
      <div className="card p-4"><p className="text-xs uppercase text-slate-500">{t('Outstanding')}</p><p className={`text-xl font-semibold ${b.outstanding > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{inr(b.outstanding)}</p></div>
      <div className={`card flex items-center justify-center p-4 text-center ${b.cleared ? 'border-emerald-200 bg-emerald-50' : b.outstanding > 0 ? 'border-amber-200 bg-amber-50' : ''}`}>
        {b.cleared ? <p className="font-semibold text-emerald-700">✓ {t('Fees Cleared')}</p> : b.outstanding > 0 ? <p className="font-semibold text-amber-800">{t('Balance')}: {inr(b.outstanding)}{b.overdue > 0 && <span className="block text-xs text-red-600">{t('Overdue')} {inr(b.overdue)}</span>}</p> : <p className="text-sm text-slate-500">No fees billed yet</p>}
      </div>
    </div>
  );
}

/** Full statement: invoices with lines, and payment history. Staff actions shown only with permission. */
export function FeeStatement({ data, receiptBase }: { data: any; receiptBase: string }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const { confirm } = useUi();
  const { run, busy } = useAction();
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [waive, setWaive] = useState<any>(null);
  const [refund, setRefund] = useState<any>(null);
  return (
    <div className="space-y-4">
      <BalanceSummary b={data.balance} />
      <Card title={t('Invoices')} bodyClass="p-0">
        <div className="divide-y">{data.invoices.map((inv: any) => (
          <div key={inv.id}>
            <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => setOpen({ ...open, [inv.id]: !open[inv.id] })} aria-expanded={!!open[inv.id]}>
              {open[inv.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className="flex-1"><span className="font-medium">{inv.period_label}</span> <span className="text-xs text-slate-500">{inv.invoice_no} · {inv.year_name} · due {fmtDate(inv.due_date)}</span></span>
              <span className="text-sm">{inr(inv.net_paise)}</span>
              {inv.outstanding_paise === 0 ? <Badge tone="green">{t('Paid')}</Badge> : <Badge tone={inv.due_date < new Date().toISOString().slice(0, 10) ? 'red' : 'amber'}>{inr(inv.outstanding_paise)} {t('Due').toLowerCase()}</Badge>}
            </button>
            {open[inv.id] && (
              <div className="overflow-x-auto bg-slate-50/60 px-4 pb-3">
                <table className="min-w-full text-sm"><thead><tr>{['Particulars', 'Amount', 'Concession', 'Waived', 'Paid', 'Balance', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                  <tbody className="divide-y">{inv.lines.map((l: any) => (
                    <tr key={l.line_id}><td className="td">{l.description}</td><td className="td">{inr(l.amount_paise)}</td><td className="td">{l.discount_paise ? inr(l.discount_paise) : '—'}</td><td className="td">{l.adjusted_paise ? inr(l.adjusted_paise) : '—'}</td>
                      <td className="td">{inr(l.paid_paise)}</td><td className="td font-medium">{inr(l.outstanding_paise)}</td>
                      <td className="td">{can('fees.refund') && l.outstanding_paise > 0 && <button className="link text-xs" onClick={() => setWaive({ line: l, amount: paiseToRupeeStr(l.outstanding_paise), reason: '' })}>Waive</button>}</td></tr>))}</tbody></table>
                {can('fees.manage') && inv.paid_paise === 0 && inv.adjusted_paise === 0 && (
                  <button className="btn-ghost btn-sm mt-2 text-red-600" onClick={async () => { const c = await confirm({ title: 'Cancel invoice', message: `Cancel ${inv.invoice_no}? Its charges can then be re-generated.`, reason: true, danger: true }); if (c) run(() => api.post(`/api/fees/invoices/${inv.id}/cancel`, { reason: c.reason })); }}>Cancel invoice</button>
                )}
              </div>
            )}
          </div>
        ))}
          {!data.invoices.length && <p className="p-4 text-sm text-slate-500">No invoices yet. Invoices are generated monthly from the assigned fee plans.</p>}
        </div>
      </Card>
      <Card title={t('Payment history')} bodyClass="p-0">
        <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50"><tr>{[t('Date'), 'Receipt', t('Amount'), 'Mode', 'Reference', t('Status'), ''].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody className="divide-y">{data.payments.map((p: any) => (
            <tr key={p.id}><td className="td">{fmtDate(p.paid_on)}</td><td className="td">{p.receipt_id ? <Link className="link" to={`${receiptBase}/${p.receipt_id}`}>{p.receipt_no}</Link> : '—'}</td>
              <td className="td font-medium">{inr(p.amount_paise)}{p.refunded_paise > 0 && <span className="block text-xs text-red-600">refunded {inr(p.refunded_paise)}</span>}</td>
              <td className="td">{p.mode.replace('_', ' ')}</td><td className="td">{p.reference ?? '—'}</td><td className="td"><StatusBadge status={p.status} />{p.reversal_reason && <span className="block text-xs text-slate-500">{p.reversal_reason}</span>}</td>
              <td className="td whitespace-nowrap">{can('fees.refund') && p.status === 'completed' && <>
                <button className="link mr-3 text-xs" onClick={() => setRefund({ p, amount: '', mode: 'cash', reference: '', reason: '' })}>Refund</button>
                {p.refunded_paise === 0 && <button className="link text-xs text-red-600" onClick={async () => { const c = await confirm({ title: 'Reverse payment', message: `Reverse ${inr(p.amount_paise)} (e.g. bounced cheque)? The receipt will be marked cancelled and the balance re-opened.`, reason: true, danger: true }); if (c) run(() => api.post(`/api/fees/payments/${p.id}/reverse`, { reason: c.reason })); }}>Reverse</button>}
              </>}</td></tr>))}
            {!data.payments.length && <tr><td colSpan={7} className="td text-slate-500">—</td></tr>}</tbody></table></div>
      </Card>
      {waive && (
        <Modal open onClose={() => setWaive(null)} title="Waive amount" footer={<><button className="btn-secondary" onClick={() => setWaive(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy || waive.reason.trim().length < 3} onClick={async () => { if (await run(() => api.post(`/api/fees/lines/${waive.line.line_id}/waive`, { amount: waive.amount, reason: waive.reason }))) setWaive(null); }}>Approve waiver</button></>}>
          <p className="mb-3 text-sm">{waive.line.description} – outstanding {inr(waive.line.outstanding_paise)}</p>
          <Field label="Amount (₹)"><input className="input" inputMode="decimal" value={waive.amount} onChange={(e) => setWaive({ ...waive, amount: e.target.value })} /></Field>
          <Field label="Reason (audited)" className="mt-3"><textarea className="input" rows={2} value={waive.reason} onChange={(e) => setWaive({ ...waive, reason: e.target.value })} /></Field>
        </Modal>
      )}
      {refund && (
        <Modal open onClose={() => setRefund(null)} title="Refund payment" footer={<><button className="btn-secondary" onClick={() => setRefund(null)}>Cancel</button>
          <button className="btn-danger" disabled={busy || refund.reason.trim().length < 3 || !refund.amount} onClick={async () => { if (await run(() => api.post(`/api/fees/payments/${refund.p.id}/refund`, { amount: refund.amount, mode: refund.mode, reference: refund.reference, reason: refund.reason }))) setRefund(null); }}>Record refund</button></>}>
          <p className="mb-3 text-sm text-slate-600">Refunded money is removed from the paid amount, so the fee becomes outstanding again unless you also waive it.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount (₹)"><input className="input" inputMode="decimal" value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} /></Field>
            <Field label="Refund mode"><select className="input" value={refund.mode} onChange={(e) => setRefund({ ...refund, mode: e.target.value })}>{['cash', 'bank_transfer', 'upi', 'cheque', 'other'].map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}</select></Field>
            <Field label="Reference"><input className="input" value={refund.reference} onChange={(e) => setRefund({ ...refund, reference: e.target.value })} /></Field>
            <Field label="Reason (audited)"><input className="input" value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}

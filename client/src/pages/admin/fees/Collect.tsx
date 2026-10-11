import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Printer, Search } from 'lucide-react';
import { Card, Field, Loading, PageHeader, useApi, useUi } from '../../../components/ui';
import { BalanceSummary } from '../../../components/FeeStatement';
import { api, qs } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { fmtDate, fullName, inr, paiseToRupeeStr, todayISO, uuid } from '../../../lib/format';

export default function Collect() {
  const { t } = useI18n();
  const { toast } = useUi();
  const [sp, setSp] = useSearchParams();
  const studentId = sp.get('studentId');
  const [term, setTerm] = useState('');
  const results = useApi<any[]>(term.trim().length >= 2 ? `/api/students${qs({ search: term.trim(), status: 'all' })}` : null);
  const st = useApi<any>(studentId ? `/api/fees/students/${studentId}/statement` : null);
  const open = useMemo(() => (st.data?.invoices ?? []).filter((i: any) => i.outstanding_paise > 0), [st.data]);
  const [selected, setSelected] = useState<number[]>([]);
  const [f, setF] = useState({ amount: '', mode: 'cash', reference: '', paidOn: todayISO(), notes: '' });
  const [key, setKey] = useState(uuid());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<any>(null);
  const dueSelected = selected.length ? open.filter((i: any) => selected.includes(i.id)).reduce((a: number, i: any) => a + i.outstanding_paise, 0) : st.data?.balance.outstanding ?? 0;
  useEffect(() => { setSelected([]); setDone(null); setKey(uuid()); }, [studentId]);
  useEffect(() => { setF((x) => ({ ...x, amount: dueSelected ? paiseToRupeeStr(dueSelected) : '' })); }, [dueSelected]);
  const needsRef = ['bank_transfer', 'upi', 'card', 'cheque'].includes(f.mode);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post('/api/fees/payments', { studentId: Number(studentId), amount: f.amount, mode: f.mode, reference: f.reference || null, paidOn: f.paidOn, notes: f.notes || null, idempotencyKey: key, invoiceIds: selected.length ? selected : undefined });
      setDone(r);
      toast('success', `Payment recorded. Receipt ${r.receiptNo}.`);
      st.refetch();
    } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title={t('Collect Fee')} />
      <Card className="mb-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input className="input pl-9" placeholder="Search by name, student ID, admission no. or roll no." value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Find student" />
        </div>
        {results.data && term && (
          <ul className="mt-2 max-h-64 divide-y overflow-y-auto rounded-lg border">{results.data.slice(0, 20).map((r) => (
            <li key={r.id}><button className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setSp({ studentId: String(r.id) }); setTerm(''); }}>
              <span><b>{fullName(r)}</b> <span className="text-slate-500">{r.student_code} · {r.class_name ?? '—'} {r.section_name ?? ''} · Roll {r.roll_no ?? '—'}</span></span>
              <span className={r.outstanding_paise > 0 ? 'text-amber-700' : 'text-emerald-700'}>{inr(r.outstanding_paise)}</span></button></li>))}
            {!results.data.length && <li className="px-3 py-2 text-sm text-slate-500">No students found.</li>}</ul>
        )}
      </Card>
      {studentId && (st.isLoading ? <Loading /> : st.data && (
        <div className="space-y-4">
          <Card title={<span>{fullName(st.data.student)} <span className="text-sm font-normal text-slate-500">{st.data.student.student_code} · {st.data.student.class_name} {st.data.student.section_name} · Roll {st.data.student.roll_no}</span></span>}
            actions={<Link className="link text-sm" to={`/admin/fees/student/${studentId}`}>{t('Fee statement')}</Link>}>
            <BalanceSummary b={st.data.balance} />
          </Card>
          {done ? (
            <Card>
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                <p className="text-lg font-semibold">Payment recorded · Receipt {done.receiptNo}</p>
                <p className="text-sm text-slate-600">Remaining balance: {inr(done.balanceAfter)}</p>
                <div className="flex gap-2">
                  <Link className="btn-primary" to={`/admin/fees/receipts/${done.receiptId}`}><Printer className="h-4 w-4" />View / print receipt</Link>
                  <button className="btn-secondary" onClick={() => { setDone(null); setKey(uuid()); setSelected([]); }}>New payment</button>
                </div>
              </div>
            </Card>
          ) : st.data.balance.outstanding > 0 ? (
            <Card title={t('Record payment')}>
              <div className="mb-4">
                <p className="label">Apply to (optional — default is oldest dues first)</p>
                <div className="flex flex-wrap gap-2">{open.map((i: any) => (
                  <label key={i.id} className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${selected.includes(i.id) ? 'border-brand-400 bg-brand-50' : ''}`}>
                    <input type="checkbox" checked={selected.includes(i.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, i.id] : selected.filter((x) => x !== i.id))} />
                    {i.period_label} · {inr(i.outstanding_paise)} <span className="text-xs text-slate-500">due {fmtDate(i.due_date)}</span></label>))}</div>
              </div>
              <form className="grid gap-4 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
                <Field label={`${t('Amount')} (₹)`} required hint={`Up to ${inr(dueSelected)}`}><input className="input" inputMode="decimal" required pattern="\d+(\.\d{1,2})?" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
                <Field label="Payment mode" required><select className="input" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>{[['cash', 'Cash'], ['upi', 'UPI'], ['bank_transfer', 'Bank transfer'], ['card', 'Card'], ['cheque', 'Cheque'], ['other', 'Other']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
                <Field label="Transaction / cheque reference" required={needsRef}><input className="input" required={needsRef} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
                <Field label="Payment date" required><input type="date" className="input" max={todayISO()} value={f.paidOn} onChange={(e) => setF({ ...f, paidOn: e.target.value })} /></Field>
                <Field label="Notes" className="md:col-span-2"><input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
                <div className="md:col-span-3"><button className="btn-primary" disabled={busy}>{busy ? 'Recording…' : `Record ${f.amount ? `₹${f.amount}` : 'payment'}`}</button>
                  <p className="mt-2 text-xs text-slate-500">Only record money actually received. The receipt is generated from this recorded payment; printing it does not change any balance.</p></div>
              </form>
            </Card>
          ) : <Card><p className="text-sm text-emerald-700">No outstanding balance for this student.</p></Card>}
        </div>
      ))}
    </>
  );
}

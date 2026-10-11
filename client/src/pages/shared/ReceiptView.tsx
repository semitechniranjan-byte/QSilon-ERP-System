import { useParams } from 'react-router-dom';
import { Download, Printer } from 'lucide-react';
import { Async, PageHeader, useApi } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { fmtDate, fmtDateTime, inr } from '../../lib/format';

const MODES: Record<string, [string, string]> = { cash: ['Cash', 'नकद'], bank_transfer: ['Bank transfer', 'बैंक ट्रांसफर'], upi: ['UPI', 'यूपीआई'], card: ['Card', 'कार्ड'], cheque: ['Cheque', 'चेक'], other: ['Other', 'अन्य'] };
const L = (lang: string, en: string, hi: string) => (lang === 'hi' ? hi : en);

/** Receipt rendered from the immutable snapshot taken when the payment was recorded. Printing changes nothing. */
export default function ReceiptView() {
  const { id } = useParams();
  const { lang, t } = useI18n();
  const { user } = useAuth();
  const q = useApi<any>(`/api/fees/receipts/${id}`);
  const print = () => { if (user?.role !== 'student') api.post(`/api/fees/receipts/${id}/printed`).catch(() => {}); window.print(); };
  return (
    <Async q={q}>{(r) => {
      const s = r.snapshot;
      const cleared = s.totals.balanceAfter === 0;
      return (
        <>
          <PageHeader title={`${L(lang, 'Receipt', 'रसीद')} ${r.receipt_no}`} subtitle={r.print_count > 0 ? `${t('Print')}: ${r.print_count}×` : undefined} actions={<>
            <button className="btn-secondary" onClick={print}><Printer className="h-4 w-4" />{t('Print')}</button>
            <a className="btn-primary" href={`/api/fees/receipts/${id}/pdf?lang=${lang}&download=1`}><Download className="h-4 w-4" />{t('Download PDF')}</a></>} />
          <article className="print-area card relative mx-auto max-w-3xl overflow-hidden p-6 sm:p-8">
            {r.status === 'cancelled' && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><span className="-rotate-12 rounded-xl border-8 border-red-500/40 px-6 text-6xl font-black text-red-500/40">{L(lang, 'CANCELLED', 'रद्द')}</span></div>}
            <header className="flex items-start gap-4 border-b-2 border-brand-700 pb-4">
              {s.school.logoFileId && <img src={`/api/files/${s.school.logoFileId}`} alt="" className="h-16 w-16 object-contain" />}
              <div><h2 className="text-xl font-bold text-brand-800">{lang === 'hi' && s.school.nameHi ? s.school.nameHi : s.school.name}</h2>
                <p className="text-sm text-slate-600">{s.school.address}</p><p className="text-sm text-slate-600">{[s.school.phone, s.school.email].filter(Boolean).join(' · ')}</p></div>
            </header>
            <h3 className="my-4 text-center text-lg font-bold tracking-wide text-brand-700">{L(lang, 'FEE RECEIPT', 'शुल्क रसीद')}</h3>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              {[[L(lang, 'Receipt No.', 'रसीद संख्या'), r.receipt_no], [L(lang, 'Payment Date', 'भुगतान तिथि'), fmtDate(s.payment.paidOn)],
                [L(lang, 'Student Name', 'विद्यार्थी का नाम'), lang === 'hi' && s.student.nameHi ? s.student.nameHi : s.student.name], [L(lang, 'Student ID', 'विद्यार्थी आईडी'), s.student.code],
                [L(lang, 'Admission No.', 'प्रवेश संख्या'), s.student.admissionNo], [L(lang, 'Roll No.', 'अनुक्रमांक'), s.student.rollNo ?? '—'],
                [L(lang, 'Class / Section', 'कक्षा / वर्ग'), `${lang === 'hi' && s.student.classNameHi ? s.student.classNameHi : s.student.className ?? '—'} / ${s.student.section ?? '—'}`], [L(lang, 'Academic Year', 'शैक्षणिक वर्ष'), s.student.year],
                [L(lang, 'Parent / Guardian', 'अभिभावक'), s.student.guardianName ?? '—'], [L(lang, 'Payment mode', 'भुगतान का माध्यम'), `${L(lang, ...(MODES[s.payment.mode] ?? ['', '']))}${s.payment.reference ? ` – ${s.payment.reference}` : ''}`],
              ].map(([k, v]) => <div key={k} className="flex gap-2"><dt className="w-36 shrink-0 text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div>)}
            </dl>
            <table className="mt-5 min-w-full border text-sm">
              <thead className="bg-brand-50"><tr>{[L(lang, 'Particulars', 'विवरण'), L(lang, 'Amount', 'राशि'), L(lang, 'Concession', 'रियायत'), L(lang, 'Due', 'देय'), L(lang, 'Paid', 'भुगतान')].map((h, i) => <th key={h} className={`th ${i ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y">{s.items.map((it: any, i: number) => (
                <tr key={i}><td className="td">{it.description}<span className="block text-xs text-slate-500">{it.invoiceNo}</span></td><td className="td text-right">{inr(it.amount)}</td><td className="td text-right">{inr(it.discount + (it.adjusted || 0))}</td><td className="td text-right">{inr(it.dueBefore)}</td><td className="td text-right font-medium">{inr(it.paid)}</td></tr>))}</tbody>
            </table>
            <dl className="ml-auto mt-4 max-w-sm space-y-1 text-sm">
              {[[L(lang, 'Total fees due (before this payment)', 'कुल देय शुल्क (इस भुगतान से पहले)'), s.totals.totalDueBefore], [L(lang, 'Previous balance (earlier months)', 'पिछला बकाया'), s.totals.previousBalance],
                [L(lang, 'Concessions / waivers applied', 'रियायत / छूट'), s.totals.concessions], [L(lang, 'Amount paid', 'भुगतान की गई राशि'), s.totals.amountPaid, true], [L(lang, 'Remaining balance', 'शेष बकाया'), s.totals.balanceAfter, true]]
                .map(([k, v, b]: any) => <div key={k} className={`flex justify-between gap-4 ${b ? 'font-semibold' : ''}`}><dt className="text-slate-600">{k}</dt><dd>{inr(v)}</dd></div>)}
            </dl>
            <div className={`mt-4 rounded-lg p-3 text-center font-bold ${cleared ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
              {cleared ? L(lang, 'FEES CLEARED', 'शुल्क पूर्ण भुगतान') : `${L(lang, 'BALANCE REMAINING', 'शेष राशि बकाया')}: ${inr(s.totals.balanceAfter)}`}
            </div>
            {s.payment.receivedBy && <p className="mt-3 text-xs text-slate-500">{L(lang, 'Received by', 'प्राप्तकर्ता')}: {s.payment.receivedBy} · {fmtDateTime(r.issued_at)}</p>}
            {/* Signature areas are blank on purpose: nobody is shown as having signed. */}
            <div className="mt-16 grid grid-cols-3 gap-6 text-center text-xs text-slate-600">
              {[L(lang, 'Authorized Signatory (School)', 'अधिकृत हस्ताक्षर (विद्यालय)'), L(lang, 'Parent / Guardian Signature', 'अभिभावक के हस्ताक्षर'), L(lang, 'Student Signature', 'विद्यार्थी के हस्ताक्षर')].map((l) => <div key={l} className="border-t border-slate-400 pt-1">{l}</div>)}
            </div>
            <p className="mt-6 text-center text-[11px] text-slate-400">{L(lang, 'This receipt is generated from a recorded payment. Signatures are valid only when signed by hand.', 'यह रसीद दर्ज भुगतान से बनाई गई है। हस्ताक्षर केवल हस्तलिखित होने पर मान्य हैं।')}</p>
          </article>
        </>
      );
    }}</Async>
  );
}

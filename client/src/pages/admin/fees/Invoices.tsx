import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Async, Card, Field, Modal, PageHeader, useAction, useApi, useUi } from '../../../components/ui';
import { DataTable } from '../../../components/DataTable';
import { StudentPicker } from '../../../components/StudentPicker';
import { api, qs } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import { useLookups } from '../../../lib/lookups';
import { fmtDate, fullName, inr, todayISO } from '../../../lib/format';

export default function Invoices() {
  const { t } = useI18n();
  const { can } = useAuth();
  const { lk, current, sectionsFor, sectionLabel } = useLookups();
  const [f, setF] = useState({ status: 'unpaid', sectionId: '', search: '' });
  const q = useApi<any[]>(`/api/fees/invoices${qs(f)}`);
  const [gen, setGen] = useState<any>(null);
  const [manual, setManual] = useState<any>(null);
  const { run, busy } = useAction();
  const { toast } = useUi();
  const month = todayISO().slice(0, 7);
  return (
    <>
      <PageHeader title={t('Invoices')} subtitle="Invoices are generated from each student's fee plans. Generation is safe to repeat — a charge is never billed twice." actions={can('fees.manage') && <>
        <button className="btn-secondary" onClick={() => setManual({ student: null, feeCategoryId: '', amount: '', description: '', dueDate: todayISO() })}>Additional charge</button>
        <button className="btn-primary" onClick={() => setGen({ fromMonth: current?.start_date.slice(0, 7) ?? month, toMonth: month, sectionId: '' })}>Generate invoices</button></>} />
      <Card bodyClass="p-0">
        <div className="grid gap-2 border-b p-3 md:grid-cols-3">
          <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label={t('Status')}>{['unpaid', 'paid', 'cancelled', 'all'].map((s) => <option key={s}>{s}</option>)}</select>
          <select className="input" value={f.sectionId} onChange={(e) => setF({ ...f, sectionId: e.target.value })} aria-label={t('Section')}><option value="">{t('All')}</option>{sectionsFor(current?.id).map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}</select>
          <input className="input" placeholder="Invoice no., student ID or name" value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })} aria-label={t('Search')} />
        </div>
        <Async q={q}>{(rows) => (
          <DataTable rows={rows} columns={[
            { key: 'invoice_no', header: 'Invoice', render: (r) => <span className="font-mono text-xs">{r.invoice_no}</span>, sortValue: (r) => r.invoice_no },
            { key: 'period_label', header: 'Period' },
            { key: 'student', header: t('Students'), render: (r) => <Link className="link" to={`/admin/fees/student/${r.student_id}`}>{fullName(r)}</Link>, sortValue: fullName },
            { key: 'class', header: t('Class'), render: (r) => `${r.class_name} ${r.section_name}` },
            { key: 'due_date', header: t('Due date'), render: (r) => fmtDate(r.due_date) },
            { key: 'net_paise', header: t('Amount'), className: 'text-right', render: (r) => inr(r.net_paise) },
            { key: 'outstanding_paise', header: t('Balance'), className: 'text-right', render: (r) => r.status === 'cancelled' ? <span className="text-xs text-red-600">cancelled</span> : <span className={r.outstanding_paise ? 'font-medium text-amber-700' : 'text-emerald-700'}>{inr(r.outstanding_paise)}</span> },
          ]} />
        )}</Async>
      </Card>
      {gen && (
        <Modal open onClose={() => setGen(null)} title="Generate invoices" footer={<><button className="btn-secondary" onClick={() => setGen(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={async () => { const r = await run(() => api.post('/api/fees/invoices/generate', { ...gen, sectionId: gen.sectionId || null }), { success: false }); if (r) { setGen(null); toast('success', `Done: ${r.linesAdded} new charge(s) on ${r.invoicesTouched} invoice(s) for ${r.students} students over ${r.months} month(s).`); } }}>Generate</button></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="From month"><input type="month" className="input" value={gen.fromMonth} onChange={(e) => setGen({ ...gen, fromMonth: e.target.value })} /></Field>
            <Field label="To month"><input type="month" className="input" value={gen.toMonth} onChange={(e) => setGen({ ...gen, toMonth: e.target.value })} /></Field>
            <Field label={t('Section')} className="sm:col-span-2"><select className="input" value={gen.sectionId} onChange={(e) => setGen({ ...gen, sectionId: e.target.value })}><option value="">All sections</option>{sectionsFor(current?.id).map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}</select></Field>
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-500">
            <li>Monthly items bill every month; quarterly / half-yearly on their cycle; annual and one-time items in the student's first billed month.</li>
            <li>One-time items (admission, uniform) are charged once per student, ever. Transport is billed only for students who opted in.</li>
            <li>Hostel plans apply only to hostel residents; if a hostel package includes a category, the base plan's item is skipped.</li>
          </ul>
        </Modal>
      )}
      {manual && (
        <Modal open onClose={() => setManual(null)} title="Additional charge" footer={<><button className="btn-secondary" onClick={() => setManual(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy || !manual.student} onClick={async () => { if (await run(() => api.post('/api/fees/manual-charge', { enrollmentId: manual.student.enrollment_id, feeCategoryId: Number(manual.feeCategoryId), amount: manual.amount, description: manual.description, dueDate: manual.dueDate }))) setManual(null); }}>Add charge</button></>}>
          <div className="grid gap-3">
            {manual.student ? <p className="text-sm">Student: <b>{fullName(manual.student)}</b> ({manual.student.student_code}) <button className="link ml-2" onClick={() => setManual({ ...manual, student: null })}>change</button></p> : <StudentPicker onPick={(s) => setManual({ ...manual, student: s })} />}
            <Field label="Category"><select className="input" value={manual.feeCategoryId} onChange={(e) => setManual({ ...manual, feeCategoryId: e.target.value })}><option value="">—</option>{lk?.categories.filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Description"><input className="input" value={manual.description} onChange={(e) => setManual({ ...manual, description: e.target.value })} placeholder="e.g. Replacement ID card" /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Amount (₹)"><input className="input" inputMode="decimal" value={manual.amount} onChange={(e) => setManual({ ...manual, amount: e.target.value })} /></Field>
              <Field label={t('Due date')}><input type="date" className="input" value={manual.dueDate} onChange={(e) => setManual({ ...manual, dueDate: e.target.value })} /></Field>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

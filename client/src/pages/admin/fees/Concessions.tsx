import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Async, Badge, Card, Field, Modal, PageHeader, useAction, useApi, useUi } from '../../../components/ui';
import { DataTable } from '../../../components/DataTable';
import { StudentPicker } from '../../../components/StudentPicker';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import { useLookups } from '../../../lib/lookups';
import { fmtDate, fullName, inr } from '../../../lib/format';

export default function Concessions() {
  const { t } = useI18n();
  const { can } = useAuth();
  const { lk } = useLookups();
  const q = useApi<any[]>('/api/fees/concessions');
  const [v, setV] = useState<any>(null);
  const { confirm } = useUi();
  const { run, busy } = useAction();
  return (
    <>
      <PageHeader title={t('Concessions')} subtitle="Concessions, scholarships and discounts reduce fees on invoices generated after they are approved. For already-issued invoices, use a waiver from the student's fee statement."
        actions={can('fees.manage') && <button className="btn-primary" onClick={() => setV({ student: null, feeCategoryId: '', label: 'concession', kind: 'percent', percent: '', amount: '', reason: '' })}><Plus className="h-4 w-4" />{t('Add')}</button>} />
      <Card bodyClass="p-0">
        <Async q={q}>{(rows) => (
          <DataTable rows={rows} search={(r) => `${fullName(r)} ${r.student_code} ${r.reason}`} columns={[
            { key: 'student', header: t('Students'), render: (r) => <span>{fullName(r)} <span className="text-xs text-slate-500">{r.student_code} · {r.class_name}-{r.section_name}</span></span> },
            { key: 'label', header: 'Type', render: (r) => <Badge tone="blue">{r.label}</Badge> },
            { key: 'value', header: 'Value', render: (r) => (r.kind === 'percent' ? `${r.percent_bp / 100}%` : `${inr(r.amount_paise)} per charge`) },
            { key: 'category_name', header: 'Applies to', render: (r) => r.category_name ?? 'All categories' },
            { key: 'reason', header: 'Reason' }, { key: 'approved_by_name', header: 'Approved by' }, { key: 'created_at', header: t('Date'), render: (r) => fmtDate(r.created_at) },
            { key: 'a', header: '', sortable: false, render: (r) => r.is_active ? (can('fees.manage') && <button className="link text-red-600" onClick={async () => { if (await confirm({ title: 'Deactivate concession', message: 'Future invoices will be billed at the full rate.', danger: true })) run(() => api.post(`/api/fees/concessions/${r.id}/deactivate`)); }}>Deactivate</button>) : <Badge>inactive</Badge> },
          ]} />
        )}</Async>
      </Card>
      {v && (
        <Modal open onClose={() => setV(null)} title="New concession / scholarship" footer={<><button className="btn-secondary" onClick={() => setV(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy || !v.student} onClick={async () => { if (await run(() => api.post('/api/fees/concessions', { enrollmentId: v.student.enrollment_id, feeCategoryId: v.feeCategoryId || null, label: v.label, kind: v.kind, percent: v.percent || null, amount: v.amount || null, reason: v.reason }))) setV(null); }}>Approve</button></>}>
          <div className="grid gap-3">
            {v.student ? <p className="text-sm">Student: <b>{fullName(v.student)}</b> ({v.student.student_code}) <button className="link ml-2" onClick={() => setV({ ...v, student: null })}>change</button></p> : <StudentPicker onPick={(s) => setV({ ...v, student: s })} />}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Type"><select className="input" value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })}><option value="concession">Concession</option><option value="scholarship">Scholarship</option><option value="discount">Discount</option></select></Field>
              <Field label="Applies to"><select className="input" value={v.feeCategoryId} onChange={(e) => setV({ ...v, feeCategoryId: e.target.value })}><option value="">All categories</option>{lk?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              <Field label="Calculation"><select className="input" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}><option value="percent">Percentage</option><option value="fixed">Fixed amount per charge</option></select></Field>
              {v.kind === 'percent' ? <Field label="Percent"><input className="input" inputMode="decimal" value={v.percent} onChange={(e) => setV({ ...v, percent: e.target.value })} /></Field>
                : <Field label="Amount (₹)"><input className="input" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} /></Field>}
            </div>
            <Field label="Reason / reference (audited)" required><textarea className="input" rows={2} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Async, Card, Field, Modal, PageHeader, StatusBadge, Tabs, useAction, useApi } from '../../components/ui';
import { DataTable } from '../../components/DataTable';
import { api } from '../../lib/api';
import { fmtDate, fmtDateTime, fullName } from '../../lib/format';
import { useI18n } from '../../lib/i18n';

export default function Enquiries() {
  const { t } = useI18n();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as 'enquiries' | 'corrections') ?? 'enquiries';
  return (
    <>
      <PageHeader title={tab === 'enquiries' ? t('Enquiries') : t('Corrections')} />
      <Tabs value={tab} onChange={(k) => setSp({ tab: k })} tabs={[{ key: 'enquiries', label: t('Admission Enquiry') }, { key: 'corrections', label: 'Profile correction requests' }]} />
      {tab === 'enquiries' ? <EnquiryList /> : <CorrectionList />}
    </>
  );
}

function EnquiryList() {
  const [status, setStatus] = useState('new');
  const q = useApi<any[]>(`/api/notices/enquiries/list?status=${status}`);
  const [sel, setSel] = useState<any>(null);
  const { run, busy } = useAction();
  return (
    <Card bodyClass="p-0">
      <Async q={q}>{(rows) => (
        <DataTable rows={rows} search={(r) => `${r.student_name} ${r.parent_name} ${r.phone}`} onRowClick={setSel}
          toolbar={<select className="input w-40" value={status} onChange={(e) => setStatus(e.target.value)}>{['new', 'contacted', 'admitted', 'closed', 'all'].map((s) => <option key={s}>{s}</option>)}</select>}
          columns={[
            { key: 'created_at', header: 'Received', render: (r) => fmtDateTime(r.created_at), sortValue: (r) => r.created_at },
            { key: 'student_name', header: 'Child' }, { key: 'class_sought', header: 'Class' }, { key: 'parent_name', header: 'Parent' },
            { key: 'phone', header: 'Phone', render: (r) => <a className="link" href={`tel:${r.phone}`} onClick={(e) => e.stopPropagation()}>{r.phone}</a> },
            { key: 'needs', header: 'Needs', sortable: false, render: (r) => [r.needs_hostel && 'Hostel', r.needs_transport && 'Transport'].filter(Boolean).join(', ') || '—' },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          ]} />
      )}</Async>
      {sel && (
        <Modal open onClose={() => setSel(null)} title={sel.student_name} footer={<><button className="btn-secondary" onClick={() => setSel(null)}>Close</button>
          <button className="btn-primary" disabled={busy} onClick={async () => { if (await run(() => api.put(`/api/notices/enquiries/${sel.id}`, { status: sel.status, notes: sel.notes ?? '' }))) setSel(null); }}>Save</button></>}>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">DOB</dt><dd>{fmtDate(sel.dob)}</dd></div><div><dt className="text-slate-500">Email</dt><dd>{sel.email ?? '—'}</dd></div>
            <div className="sm:col-span-2"><dt className="text-slate-500">Message</dt><dd className="whitespace-pre-line">{sel.message ?? '—'}</dd></div>
          </dl>
          <div className="mt-4 grid gap-3">
            <Field label="Status"><select className="input" value={sel.status} onChange={(e) => setSel({ ...sel, status: e.target.value })}>{['new', 'contacted', 'admitted', 'closed'].map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Office notes"><textarea className="input" rows={3} value={sel.notes ?? ''} onChange={(e) => setSel({ ...sel, notes: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </Card>
  );
}

function CorrectionList() {
  const [status, setStatus] = useState('pending');
  const q = useApi<any[]>(`/api/students/corrections?status=${status}`);
  const { run } = useAction();
  const decide = (id: number, approve: boolean) => {
    const response = approve ? '' : window.prompt('Reason for rejection (shown to the student):') ?? '';
    return run(() => api.post(`/api/students/corrections/${id}/decide`, { approve, response }));
  };
  return (
    <Card bodyClass="p-0">
      <Async q={q}>{(rows) => (
        <DataTable rows={rows} toolbar={<select className="input w-40" value={status} onChange={(e) => setStatus(e.target.value)}>{['pending', 'approved', 'rejected'].map((s) => <option key={s}>{s}</option>)}</select>}
          columns={[
            { key: 'created_at', header: 'Requested', render: (r) => fmtDate(r.created_at) },
            { key: 'student', header: 'Student', render: (r) => `${fullName(r)} (${r.student_code})` },
            { key: 'field', header: 'Field' }, { key: 'current_value', header: 'Current' }, { key: 'requested_value', header: 'Requested' }, { key: 'reason', header: 'Reason' },
            { key: 'a', header: '', sortable: false, render: (r) => r.status === 'pending' ? <div className="flex gap-2"><button className="btn-primary btn-sm" onClick={() => decide(r.id, true)}>Approve</button><button className="btn-secondary btn-sm" onClick={() => decide(r.id, false)}>Reject</button></div> : <StatusBadge status={r.status} /> },
          ]} />
      )}</Async>
      <p className="p-3 text-xs text-slate-500">Approving updates the student's record for address, blood group, emergency contact and Hindi name. "Other" requests must be applied manually via Edit.</p>
    </Card>
  );
}

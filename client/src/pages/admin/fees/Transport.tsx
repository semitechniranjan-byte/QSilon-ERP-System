import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Async, Badge, Card, DeleteButton, Field, Modal, PageHeader, useAction, useApi } from '../../../components/ui';
import { DataTable } from '../../../components/DataTable';
import { api } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { fullName, inr, paiseToRupeeStr } from '../../../lib/format';

export default function Transport() {
  const { t } = useI18n();
  const q = useApi<any[]>('/api/fees/routes');
  const [edit, setEdit] = useState<any>(null);
  const [riders, setRiders] = useState<any>(null);
  const r = useApi<any[]>(riders ? `/api/fees/routes/${riders.id}/riders` : null);
  const { run, busy, fieldErrors } = useAction();
  return (
    <>
      <PageHeader title={t('Transport')} subtitle="Transport is billed monthly at the route fee, only to students who opted in." actions={<button className="btn-primary" onClick={() => setEdit({ name: '', description: '', stops: '', vehicleNo: '', driverName: '', driverPhone: '', monthlyFee: '', isActive: true })}><Plus className="h-4 w-4" />Route</button>} />
      <Card bodyClass="p-0">
        <Async q={q}>{(rows) => (
          <DataTable rows={rows} columns={[
            { key: 'name', header: 'Route', render: (r) => <span className="font-medium">{r.name} {!r.is_active && <Badge>inactive</Badge>}</span> },
            { key: 'stops', header: 'Stops', render: (r) => <span className="text-xs">{r.stops ?? '—'}</span> },
            { key: 'vehicle_no', header: 'Vehicle' }, { key: 'driver', header: 'Driver', render: (r) => [r.driver_name, r.driver_phone].filter(Boolean).join(' · ') || '—' },
            { key: 'monthly_fee_paise', header: 'Monthly fee', className: 'text-right', render: (r) => inr(r.monthly_fee_paise) },
            { key: 'riders', header: 'Students', className: 'text-right', render: (r) => <button className="link" onClick={() => setRiders(r)}>{r.riders}</button> },
            { key: 'd', header: '', sortable: false, render: (r) => <DeleteButton url={`/api/fees/routes/${r.id}`} what={`Route "${r.name}"`} /> },
            { key: 'e', header: '', sortable: false, render: (r) => <button className="link" onClick={() => setEdit({ id: r.id, name: r.name, description: r.description ?? '', stops: r.stops ?? '', vehicleNo: r.vehicle_no ?? '', driverName: r.driver_name ?? '', driverPhone: r.driver_phone ?? '', monthlyFee: paiseToRupeeStr(r.monthly_fee_paise), isActive: r.is_active })}>{t('Edit')}</button> },
          ]} />
        )}</Async>
      </Card>
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? 'Edit route' : 'New route'} footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={async () => { if (await run(() => (edit.id ? api.put(`/api/fees/routes/${edit.id}`, edit) : api.post('/api/fees/routes', edit)))) setEdit(null); }}>Save</button></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Route name" error={fieldErrors.name}><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Monthly fee (₹)" error={fieldErrors.monthlyFee}><input className="input" inputMode="decimal" value={edit.monthlyFee} onChange={(e) => setEdit({ ...edit, monthlyFee: e.target.value })} /></Field>
            <Field label="Stops" className="sm:col-span-2"><textarea className="input" rows={2} value={edit.stops} onChange={(e) => setEdit({ ...edit, stops: e.target.value })} /></Field>
            <Field label="Vehicle no."><input className="input" value={edit.vehicleNo} onChange={(e) => setEdit({ ...edit, vehicleNo: e.target.value })} /></Field>
            <Field label="Driver name"><input className="input" value={edit.driverName} onChange={(e) => setEdit({ ...edit, driverName: e.target.value })} /></Field>
            <Field label="Driver phone" hint="Not shown on the public website."><input className="input" value={edit.driverPhone} onChange={(e) => setEdit({ ...edit, driverPhone: e.target.value })} /></Field>
            {edit.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} />Active</label>}
          </div>
        </Modal>
      )}
      <Modal open={!!riders} onClose={() => setRiders(null)} title={`${riders?.name}: students`}>
        <Async q={r}>{(rows) => <ul className="divide-y text-sm">{rows.map((s) => <li key={s.id} className="py-2">{fullName(s)} <span className="text-slate-500">{s.class_name}-{s.section_name} · {s.student_code}</span></li>)}{!rows.length && <li className="py-2 text-slate-500">—</li>}</ul>}</Async>
      </Modal>
    </>
  );
}

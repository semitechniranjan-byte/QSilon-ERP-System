import { useState } from 'react';
import { Async, Card, PageHeader, useApi } from '../../components/ui';
import { DataTable } from '../../components/DataTable';
import { qs } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';

export default function Audit() {
  const [f, setF] = useState({ action: '', entityType: '', from: '', to: '' });
  const q = useApi<any[]>(`/api/settings/audit${qs({ ...f, limit: 1000 })}`);
  return (
    <>
      <PageHeader title="Audit log" subtitle="Sensitive operations: payments, refunds, corrections, publication of results, account changes and exports." />
      <Card bodyClass="p-0">
        <div className="grid gap-2 border-b p-3 md:grid-cols-4">
          <input className="input" placeholder="Action starts with… (e.g. payment.)" value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })} aria-label="Action" />
          <input className="input" placeholder="Entity type (e.g. student)" value={f.entityType} onChange={(e) => setF({ ...f, entityType: e.target.value })} aria-label="Entity" />
          <input type="date" className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} aria-label="From" />
          <input type="date" className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label="To" />
        </div>
        <Async q={q}>{(rows) => (
          <DataTable rows={rows} pageSize={50} search={(r) => `${r.action} ${r.entity_type} ${r.entity_id} ${r.username ?? ''} ${JSON.stringify(r.details ?? {})}`} columns={[
            { key: 'at', header: 'When', render: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.at)}</span>, sortValue: (r) => r.at },
            { key: 'who', header: 'Who', render: (r) => r.display_name ? `${r.display_name} (${r.username})` : 'System' },
            { key: 'action', header: 'Action', render: (r) => <span className="font-mono text-xs">{r.action}</span> },
            { key: 'entity', header: 'Record', render: (r) => `${r.entity_type} ${r.entity_id ?? ''}` },
            { key: 'details', header: 'Details', sortable: false, render: (r) => <code className="block max-w-md truncate text-xs" title={JSON.stringify(r.details)}>{r.details ? JSON.stringify(r.details) : ''}</code> },
            { key: 'ip', header: 'IP' },
          ]} />
        )}</Async>
      </Card>
    </>
  );
}

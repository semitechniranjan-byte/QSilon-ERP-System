import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Async, Badge, Card, Field, Modal, PageHeader, Tabs, useAction, useApi, useUi } from '../../components/ui';
import { DataTable } from '../../components/DataTable';
import { CredentialsModal } from '../../components/Credentials';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fmtDateTime } from '../../lib/format';

export default function Users() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as 'users' | 'resets') ?? 'users';
  return (
    <>
      <PageHeader title="Users & access" subtitle="Teacher and student accounts are created from their records. Here you manage office accounts, permissions and password resets." />
      <Tabs value={tab} onChange={(k) => setSp({ tab: k })} tabs={[{ key: 'users', label: 'Accounts' }, { key: 'resets', label: 'Password reset requests' }]} />
      {tab === 'users' ? <UserList /> : <Resets />}
    </>
  );
}

function UserList() {
  const { user } = useAuth();
  const [role, setRole] = useState('');
  const q = useApi<any>(`/api/settings/users${role ? `?role=${role}` : ''}`);
  const [creds, setCreds] = useState<any>(null);
  const [create, setCreate] = useState<any>(null);
  const [perm, setPerm] = useState<any>(null);
  const { confirm } = useUi();
  const { run, busy, fieldErrors } = useAction();
  return (
    <Card bodyClass="p-0">
      <Async q={q}>{(d) => (
        <>
          <DataTable rows={d.users} search={(r) => `${r.username} ${r.display_name}`} toolbar={<>
            <select className="input w-36" value={role} onChange={(e) => setRole(e.target.value)}><option value="">All roles</option>{['admin', 'accountant', 'teacher', 'student'].map((r) => <option key={r}>{r}</option>)}</select>
            <button className="btn-primary" onClick={() => setCreate({ username: '', displayName: '', role: 'accountant', email: '' })}><Plus className="h-4 w-4" />Office account</button></>}
            columns={[
              { key: 'username', header: 'User ID', render: (r) => <span className="font-mono text-xs">{r.username}</span> }, { key: 'display_name', header: 'Name' },
              { key: 'role', header: 'Role', render: (r) => <Badge tone={r.role === 'admin' ? 'purple' : 'blue'}>{r.role}</Badge> },
              { key: 'extra', header: 'Extra permissions', sortable: false, render: (r) => <span className="text-xs">{r.extra_permissions.join(', ') || '—'}</span> },
              { key: 'last_login_at', header: 'Last sign-in', render: (r) => fmtDateTime(r.last_login_at), sortValue: (r) => r.last_login_at },
              { key: 'state', header: 'State', render: (r) => <span className="flex flex-wrap gap-1">{r.is_active ? <Badge tone="green">active</Badge> : <Badge tone="red">inactive</Badge>}{r.must_change_password && <Badge tone="amber">temp password</Badge>}{r.locked_until && new Date(r.locked_until) > new Date() && <Badge tone="red">locked</Badge>}</span> },
              { key: 'a', header: '', sortable: false, render: (r) => <span className="flex gap-3 whitespace-nowrap">
                <button className="link" onClick={async () => { if (await confirm({ title: 'Reset password', message: `Issue a temporary password for ${r.username}?` })) { const x = await run(() => api.post(`/api/settings/users/${r.id}/reset-password`), { success: false }); if (x) setCreds({ ...x, name: r.display_name }); } }}>Reset</button>
                {r.role !== 'student' && r.role !== 'admin' && <button className="link" onClick={() => setPerm({ user: r, perms: r.extra_permissions })}>Permissions</button>}
                {r.id !== user?.id && <button className="link" onClick={async () => { if (await confirm({ title: r.is_active ? 'Deactivate' : 'Activate', message: r.username, danger: r.is_active })) run(() => api.post(`/api/settings/users/${r.id}/active`, { active: !r.is_active })); }}>{r.is_active ? 'Deactivate' : 'Activate'}</button>}</span> },
            ]} />
          {perm && (
            <Modal open onClose={() => setPerm(null)} title={`Extra permissions: ${perm.user.display_name}`} footer={<><button className="btn-secondary" onClick={() => setPerm(null)}>Cancel</button>
              <button className="btn-primary" disabled={busy} onClick={async () => { if (await run(() => api.put(`/api/settings/users/${perm.user.id}/permissions`, { permissions: perm.perms }))) setPerm(null); }}>Save</button></>}>
              <div className="space-y-2">{d.grantable.map((g: any) => <label key={g.key} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={perm.perms.includes(g.key)} onChange={(e) => setPerm({ ...perm, perms: e.target.checked ? [...perm.perms, g.key] : perm.perms.filter((x: string) => x !== g.key) })} /><span><b>{g.key}</b><span className="block text-slate-500">{g.label}</span></span></label>)}</div>
            </Modal>
          )}
        </>
      )}</Async>
      {create && (
        <Modal open onClose={() => setCreate(null)} title="New office account" footer={<><button className="btn-secondary" onClick={() => setCreate(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={async () => { const r = await run(() => api.post('/api/settings/users', create), { success: false }); if (r) { setCreate(null); setCreds({ username: r.username, temporaryPassword: r.temporaryPassword }); } }}>Create</button></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="User ID" error={fieldErrors.username}><input className="input" value={create.username} onChange={(e) => setCreate({ ...create, username: e.target.value })} /></Field>
            <Field label="Name" error={fieldErrors.displayName}><input className="input" value={create.displayName} onChange={(e) => setCreate({ ...create, displayName: e.target.value })} /></Field>
            <Field label="Role" hint="Accountant: fee collection, receipts and fee reports."><select className="input" value={create.role} onChange={(e) => setCreate({ ...create, role: e.target.value })}><option value="accountant">Accountant</option><option value="admin">Administrator</option></select></Field>
            <Field label="Email" error={fieldErrors.email}><input className="input" type="email" value={create.email} onChange={(e) => setCreate({ ...create, email: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
      <CredentialsModal creds={creds} onClose={() => setCreds(null)} />
    </Card>
  );
}

function Resets() {
  const q = useApi<any[]>('/api/settings/reset-requests');
  const [creds, setCreds] = useState<any>(null);
  const { run } = useAction();
  return (
    <Card bodyClass="p-0">
      <Async q={q}>{(rows) => (
        <DataTable rows={rows} columns={[
          { key: 'created_at', header: 'Requested', render: (r) => fmtDateTime(r.created_at) }, { key: 'identifier', header: 'Entered ID' },
          { key: 'user', header: 'Matched account', render: (r) => (r.user_id ? `${r.display_name} (${r.username}, ${r.role})` : <span className="text-amber-700">no matching account</span>) },
          { key: 'a', header: '', sortable: false, render: (r) => <span className="flex gap-3">{r.user_id && <button className="btn-primary btn-sm" onClick={async () => { const x = await run(() => api.post(`/api/settings/users/${r.user_id}/reset-password`), { success: false }); if (x) setCreds({ ...x, name: r.display_name }); }}>Verify identity & reset</button>}
            <button className="link" onClick={() => run(() => api.post(`/api/settings/reset-requests/${r.id}/reject`))}>Dismiss</button></span> },
        ]} />
      )}</Async>
      <p className="p-3 text-xs text-slate-500">Confirm the person's identity (in person or by calling the registered parent number) before issuing a temporary password.</p>
      <CredentialsModal creds={creds} onClose={() => setCreds(null)} />
    </Card>
  );
}

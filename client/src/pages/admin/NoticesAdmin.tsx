import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Async, Badge, Card, Field, Modal, PageHeader, Tabs, useAction, useApi, useUi } from '../../components/ui';
import { DataTable } from '../../components/DataTable';
import { NoticeModal } from '../../components/NoticeForm';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { fmtDate, fmtDateTime } from '../../lib/format';

const toLocal = (d?: string | null) => (d ? new Date(new Date(d).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

export default function NoticesAdmin() {
  const { t } = useI18n();
  const [tab, setTab] = useState<'notices' | 'events'>('notices');
  return (
    <>
      <PageHeader title={t('Notices & Events')} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'notices', label: t('Notices') }, { key: 'events', label: 'Events & academic calendar' }]} />
      {tab === 'notices' ? <Notices /> : <Events />}
    </>
  );
}

function Notices() {
  const q = useApi<any[]>('/api/notices/manage');
  const sections = useApi<any[]>('/api/academics/sections');
  const [edit, setEdit] = useState<any>(null);
  const { confirm } = useUi();
  const { run } = useAction();
  return (
    <Card bodyClass="p-0">
      <Async q={q}>{(rows) => (
        <DataTable rows={rows} search={(r) => `${r.title} ${r.body}`} toolbar={<button className="btn-primary" onClick={() => setEdit({ title: '', titleHi: '', body: '', bodyHi: '', audience: 'all', sectionId: '', pinned: false, publishAt: '', expiresAt: '', attachmentFileId: null })}><Plus className="h-4 w-4" />Notice</button>}
          columns={[
            { key: 'title', header: 'Title', render: (r) => <span className="font-medium">{r.pinned && '📌 '}{r.title}</span> },
            { key: 'audience', header: 'Audience', render: (r) => <Badge tone={r.audience === 'public' ? 'green' : 'blue'}>{r.audience === 'section' ? `${r.class_name}-${r.section_name}` : r.audience}</Badge> },
            { key: 'publish_at', header: 'Published', render: (r) => fmtDateTime(r.publish_at), sortValue: (r) => r.publish_at },
            { key: 'expires_at', header: 'Expires', render: (r) => fmtDate(r.expires_at) }, { key: 'author', header: 'By' },
            { key: 'a', header: '', sortable: false, render: (r) => <span className="whitespace-nowrap"><button className="link mr-3" onClick={() => setEdit({ id: r.id, title: r.title, titleHi: r.title_hi, body: r.body, bodyHi: r.body_hi, audience: r.audience, sectionId: r.section_id ?? '', pinned: r.pinned, publishAt: toLocal(r.publish_at), expiresAt: toLocal(r.expires_at), attachmentFileId: r.attachment_file_id })}>Edit</button>
              <button className="link text-red-600" onClick={async () => { if (await confirm({ title: 'Delete notice', message: r.title, danger: true })) run(() => api.del(`/api/notices/${r.id}`)); }}>Delete</button></span> },
          ]} />
      )}</Async>
      {edit && <NoticeModal notice={edit} sections={sections.data ?? []} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function Events() {
  const q = useApi<any[]>('/api/notices/events/list');
  const [edit, setEdit] = useState<any>(null);
  const { confirm } = useUi();
  const { run, busy, fieldErrors } = useAction();
  return (
    <Card bodyClass="p-0">
      <Async q={q}>{(rows) => (
        <DataTable rows={rows} toolbar={<button className="btn-primary" onClick={() => setEdit({ title: '', titleHi: '', description: '', eventType: 'event', startDate: '', endDate: '', location: '', isPublic: true })}><Plus className="h-4 w-4" />Event</button>}
          columns={[
            { key: 'start_date', header: 'Date', render: (r) => `${fmtDate(r.start_date)}${r.end_date && r.end_date !== r.start_date ? ` – ${fmtDate(r.end_date)}` : ''}`, sortValue: (r) => r.start_date },
            { key: 'title', header: 'Title' }, { key: 'event_type', header: 'Type', render: (r) => <Badge tone={r.event_type === 'holiday' ? 'red' : 'blue'}>{r.event_type}</Badge> },
            { key: 'location', header: 'Location' }, { key: 'p', header: 'Public', render: (r) => (r.is_public ? 'Yes' : 'No') },
            { key: 'a', header: '', sortable: false, render: (r) => <span className="whitespace-nowrap"><button className="link mr-3" onClick={() => setEdit({ id: r.id, title: r.title, titleHi: r.title_hi ?? '', description: r.description ?? '', eventType: r.event_type, startDate: r.start_date, endDate: r.end_date ?? '', location: r.location ?? '', isPublic: r.is_public })}>Edit</button>
              <button className="link text-red-600" onClick={async () => { if (await confirm({ title: 'Delete event', message: r.title, danger: true })) run(() => api.del(`/api/notices/events/${r.id}`)); }}>Delete</button></span> },
          ]} />
      )}</Async>
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? 'Edit event' : 'New event'} footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={async () => { if (await run(() => (edit.id ? api.put(`/api/notices/events/${edit.id}`, edit) : api.post('/api/notices/events', edit)))) setEdit(null); }}>Save</button></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title" error={fieldErrors.title}><input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="Title (Hindi)"><input className="input" value={edit.titleHi} onChange={(e) => setEdit({ ...edit, titleHi: e.target.value })} /></Field>
            <Field label="Type"><select className="input" value={edit.eventType} onChange={(e) => setEdit({ ...edit, eventType: e.target.value })}>{['event', 'holiday', 'exam', 'meeting', 'activity'].map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Location"><input className="input" value={edit.location} onChange={(e) => setEdit({ ...edit, location: e.target.value })} /></Field>
            <Field label="Start date" error={fieldErrors.startDate}><input type="date" className="input" value={edit.startDate} onChange={(e) => setEdit({ ...edit, startDate: e.target.value })} /></Field>
            <Field label="End date"><input type="date" className="input" value={edit.endDate} onChange={(e) => setEdit({ ...edit, endDate: e.target.value })} /></Field>
            <Field label="Description" className="sm:col-span-2"><textarea className="input" rows={3} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.isPublic} onChange={(e) => setEdit({ ...edit, isPublic: e.target.checked })} />Show on public website</label>
          </div>
        </Modal>
      )}
    </Card>
  );
}

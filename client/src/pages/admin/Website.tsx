import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Async, Card, Field, FileInput, Modal, PageHeader, Tabs, useAction, useApi, useUi } from '../../components/ui';
import { api } from '../../lib/api';
import { ICONS } from '../public/Home';

export default function Website() {
  const [tab, setTab] = useState<'pages' | 'facilities' | 'gallery'>('pages');
  return (
    <>
      <PageHeader title="Website content" subtitle="Everything shown on the public website. School name, contact, logo and statistics are under Settings → School profile." actions={<a className="btn-secondary" href="/" target="_blank" rel="noreferrer">View website</a>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'pages', label: 'Pages' }, { key: 'facilities', label: 'Facilities' }, { key: 'gallery', label: 'Gallery' }]} />
      {tab === 'pages' && <Pages />}{tab === 'facilities' && <Facilities />}{tab === 'gallery' && <Gallery />}
    </>
  );
}

function Pages() {
  const q = useApi<any[]>('/api/settings/website/pages');
  const [key, setKey] = useState('about');
  const [v, setV] = useState<any>(null);
  const { run, busy } = useAction();
  useEffect(() => { const p = q.data?.find((x) => x.key === key); if (p) setV({ title: p.title, titleHi: p.title_hi ?? '', body: p.body ?? '', bodyHi: p.body_hi ?? '' }); }, [q.data, key]);
  return (
    <Card title={<select className="input" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Page">{q.data?.map((p) => <option key={p.key} value={p.key}>{p.title}</option>)}</select>}
      actions={v && <button className="btn-primary" disabled={busy} onClick={() => run(() => api.put(`/api/settings/website/pages/${key}`, v))}>Save</button>}>
      {v && <div className="grid gap-3 md:grid-cols-2">
        <Field label="Title (English)"><input className="input" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
        <Field label="Title (Hindi)"><input className="input" value={v.titleHi} onChange={(e) => setV({ ...v, titleHi: e.target.value })} /></Field>
        <Field label="Content (English)" hint="Plain text. Leave a blank line between paragraphs."><textarea className="input font-[inherit]" rows={14} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} /></Field>
        <Field label="Content (Hindi)"><textarea className="input" rows={14} value={v.bodyHi} onChange={(e) => setV({ ...v, bodyHi: e.target.value })} /></Field>
      </div>}
    </Card>
  );
}

function Facilities() {
  const q = useApi<any[]>('/api/settings/website/facilities');
  const [edit, setEdit] = useState<any>(null);
  const { confirm } = useUi();
  const { run, busy } = useAction();
  return (
    <Card actions={<button className="btn-primary" onClick={() => setEdit({ title: '', titleHi: '', description: '', descriptionHi: '', icon: 'star', sortOrder: (q.data?.length ?? 0) + 1, isPublished: true })}><Plus className="h-4 w-4" />Facility</button>}>
      <Async q={q}>{(rows) => (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rows.map((f) => { const I = ICONS[f.icon] ?? ICONS.star; return (
          <div key={f.id} className="rounded-lg border p-3"><div className="flex items-start justify-between"><I className="h-5 w-5 text-brand-600" />
            <div className="flex gap-2"><button className="link text-xs" onClick={() => setEdit({ id: f.id, title: f.title, titleHi: f.title_hi ?? '', description: f.description ?? '', descriptionHi: f.description_hi ?? '', icon: f.icon, sortOrder: f.sort_order, isPublished: f.is_published })}>Edit</button>
              <button className="text-red-600" aria-label="Delete" onClick={async () => { if (await confirm({ title: 'Delete facility', message: f.title, danger: true })) run(() => api.del(`/api/settings/website/facilities/${f.id}`)); }}><Trash2 className="h-4 w-4" /></button></div></div>
            <p className="mt-2 font-medium">{f.title} {!f.is_published && <span className="text-xs text-slate-400">(hidden)</span>}</p><p className="text-sm text-slate-600">{f.description}</p></div>); })}</div>
      )}</Async>
      {edit && (
        <Modal open onClose={() => setEdit(null)} title="Facility" footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={async () => { if (await run(() => (edit.id ? api.put(`/api/settings/website/facilities/${edit.id}`, edit) : api.post('/api/settings/website/facilities', edit)))) setEdit(null); }}>Save</button></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title"><input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="Title (Hindi)"><input className="input" value={edit.titleHi} onChange={(e) => setEdit({ ...edit, titleHi: e.target.value })} /></Field>
            <Field label="Description" className="sm:col-span-2"><textarea className="input" rows={2} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Description (Hindi)" className="sm:col-span-2"><textarea className="input" rows={2} value={edit.descriptionHi} onChange={(e) => setEdit({ ...edit, descriptionHi: e.target.value })} /></Field>
            <Field label="Icon"><select className="input" value={edit.icon} onChange={(e) => setEdit({ ...edit, icon: e.target.value })}>{Object.keys(ICONS).map((k) => <option key={k}>{k}</option>)}</select></Field>
            <Field label="Order"><input className="input" type="number" value={edit.sortOrder} onChange={(e) => setEdit({ ...edit, sortOrder: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.isPublished} onChange={(e) => setEdit({ ...edit, isPublished: e.target.checked })} />Published</label>
          </div>
        </Modal>
      )}
    </Card>
  );
}

function Gallery() {
  const q = useApi<any[]>('/api/settings/website/gallery');
  const { confirm } = useUi();
  const { run } = useAction();
  const [title, setTitle] = useState('');
  return (
    <Card title={<div className="flex flex-wrap items-center gap-2"><input className="input w-64" placeholder="Caption for the next photo" value={title} onChange={(e) => setTitle(e.target.value)} />
      <FileInput purpose="gallery" accept="image/jpeg,image/png,image/webp" label="Upload photo" onUploaded={(f) => { run(() => api.post('/api/settings/website/gallery', { title: title || f.name, fileId: f.id, isPublished: true })); setTitle(''); }} /></div>}>
      <p className="mb-1 text-sm text-slate-600">Photos uploaded here appear on the home page: the newest 6 rotate in the top slideshow and also show in the “Life at our campus” section. Wide (landscape) photos of the building, classrooms, labs, sports and events look best.</p>
      <p className="mb-3 text-xs text-slate-500">Do not upload photos that identify children without parental consent.</p>
      <Async q={q}>{(rows) => (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{rows.map((g) => (
          <figure key={g.id} className="relative overflow-hidden rounded-lg border">
            <img src={`/api/files/${g.file_id}`} alt={g.title} className="aspect-[4/3] w-full object-cover" />
            <figcaption className="flex items-center justify-between gap-1 p-2 text-xs"><span className="truncate">{g.title}</span>
              <button className="text-red-600" aria-label="Delete" onClick={async () => { if (await confirm({ title: 'Remove photo', message: g.title, danger: true })) run(() => api.del(`/api/settings/website/gallery/${g.id}`)); }}><Trash2 className="h-4 w-4" /></button></figcaption>
          </figure>))}</div>
      )}</Async>
    </Card>
  );
}

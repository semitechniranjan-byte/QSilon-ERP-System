import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Async, Badge, Card, DeleteButton, Field, FileInput, Modal, PageHeader, StatusBadge, Tabs, useAction, useApi, useUi } from '../../components/ui';
import { DataTable } from '../../components/DataTable';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useLookups } from '../../lib/lookups';
import { fmtDate, fmtDateTime } from '../../lib/format';

export default function Settings() {
  const [tab, setTab] = useState<'school' | 'years' | 'boards' | 'grading' | 'messages' | 'demo'>(() => (new URLSearchParams(location.search).get('tab') === 'demo' ? 'demo' : 'school'));
  return (
    <>
      <PageHeader title="Settings" />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'school', label: 'School profile' }, { key: 'years', label: 'Academic years & terms' }, { key: 'boards', label: 'Boards & mediums' }, { key: 'grading', label: 'Grading & assessment' }, { key: 'messages', label: 'Messaging' }, { key: 'demo', label: 'Sample data' }]} />
      {tab === 'school' && <School />}{tab === 'years' && <Years />}{tab === 'boards' && <Boards />}{tab === 'grading' && <Grading />}{tab === 'messages' && <Messages />}{tab === 'demo' && <DemoData />}
    </>
  );
}

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

function School() {
  const q = useApi<any>('/api/settings/school');
  const { refresh } = useAuth();
  const [v, setV] = useState<any>(null);
  const { run, busy, fieldErrors: e } = useAction();
  useEffect(() => { if (q.data) setV(Object.fromEntries(Object.entries(q.data).map(([k, val]) => [camel(k), val ?? '']))); }, [q.data]);
  if (!v) return null;
  const inp = (k: string, label: string, props: any = {}) => <Field label={label} error={e[k]} className={props.wide ? 'md:col-span-2' : ''}>{props.area ? <textarea className="input" rows={4} value={v[k]} onChange={(x) => setV({ ...v, [k]: x.target.value })} /> : <input className="input" type={props.type ?? 'text'} value={v[k]} onChange={(x) => setV({ ...v, [k]: x.target.value })} />}</Field>;
  const chk = (k: string, label: string) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!v[k]} onChange={(x) => setV({ ...v, [k]: x.target.checked })} />{label}</label>;
  const save = async () => {
    const { id, updatedAt, ...body } = v; void id; void updatedAt;
    if (await run(() => api.put('/api/settings/school', body))) refresh();
  };
  return (
    <div className="space-y-4">
      <Card title="Identity & contact" actions={<button className="btn-primary" disabled={busy} onClick={save}>Save</button>}>
        <div className="grid gap-3 md:grid-cols-2">
          {inp('name', 'School name')}{inp('nameHi', 'School name (Hindi)')}{inp('tagline', 'Tagline')}{inp('taglineHi', 'Tagline (Hindi)')}
          {inp('address', 'Address', { wide: true })}{inp('city', 'City')}{inp('state', 'State')}{inp('pincode', 'PIN code')}{inp('phone', 'Phone')}{inp('email', 'Email')}{inp('website', 'Website')}
          {inp('mapUrl', 'Map link (Google Maps URL)')}{inp('schoolHours', 'School timings')}{inp('schoolHoursHi', 'School timings (Hindi)')}{inp('establishedYear', 'Established year', { type: 'number' })}{inp('principalName', 'Principal name')}
          <div className="flex flex-wrap items-center gap-4 md:col-span-2">
            <div className="flex items-center gap-2">{v.logoFileId && <img src={`/api/files/${v.logoFileId}`} alt="Logo" className="h-12 w-12 rounded object-contain" />}<FileInput purpose="logo" accept="image/png,image/jpeg,image/webp" label={v.logoFileId ? 'Replace logo' : 'Upload logo'} onUploaded={(f) => setV({ ...v, logoFileId: f.id })} /></div>
            <div className="flex items-center gap-2">{v.heroImageFileId && <img src={`/api/files/${v.heroImageFileId}`} alt="Hero" className="h-12 w-20 rounded object-cover" />}<FileInput purpose="hero" accept="image/png,image/jpeg,image/webp" label={v.heroImageFileId ? 'Replace homepage image' : 'Upload homepage image'} onUploaded={(f) => setV({ ...v, heroImageFileId: f.id })} /></div>
          </div>
          {inp('about', 'About (English)', { area: true })}{inp('aboutHi', 'About (Hindi)', { area: true })}{inp('mission', 'Mission (English)', { area: true })}{inp('missionHi', 'Mission (Hindi)', { area: true })}
        </div>
      </Card>
      <Card title="Public statistics" actions={<button className="btn-primary" disabled={busy} onClick={save}>Save</button>}>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Mode" hint="Automatic uses live aggregate counts (never individual records)."><select className="input" value={v.publicStatsMode} onChange={(x) => setV({ ...v, publicStatsMode: x.target.value })}><option value="auto">Automatic</option><option value="manual">Manual numbers</option><option value="hidden">Hidden</option></select></Field>
          {v.publicStatsMode === 'manual' && <>{inp('publicStudentsCount', 'Students', { type: 'number' })}{inp('publicTeachersCount', 'Teachers', { type: 'number' })}{inp('publicClassesCount', 'Classes', { type: 'number' })}{inp('publicYearsExperience', 'Years of experience', { type: 'number' })}</>}
          {chk('enquiryEnabled', 'Accept online admission enquiries')}
        </div>
      </Card>
      <Card title="Numbering, login & policies" actions={<button className="btn-primary" disabled={busy} onClick={save}>Save</button>}>
        <div className="grid gap-3 md:grid-cols-3">
          {inp('studentIdPrefix', 'Student ID prefix')}{inp('teacherIdPrefix', 'Teacher ID prefix')}{inp('admissionPrefix', 'Admission no. prefix')}{inp('receiptPrefix', 'Receipt prefix')}{inp('invoicePrefix', 'Invoice prefix')}
          <Field label="Default interface language"><select className="input" value={v.defaultLanguage} onChange={(x) => setV({ ...v, defaultLanguage: x.target.value })}><option value="en">English</option><option value="hi">हिन्दी</option></select></Field>
          {inp('attendanceEditWindowDays', 'Teachers may edit attendance for (days)', { type: 'number' })}
          <div className="space-y-2 md:col-span-2">{chk('allowAdmissionNoLogin', 'Students may sign in with admission number')}{chk('allowRollLogin', 'Students may sign in with CLASS-SECTION-ROLL (e.g. 5-A-12)')}{chk('showFeesToStudents', 'Show fee statements and receipts in the student portal')}</div>
        </div>
      </Card>
    </div>
  );
}

function Years() {
  const { lk } = useLookups();
  const { confirm } = useUi();
  const { run, busy, fieldErrors } = useAction();
  const [edit, setEdit] = useState<any>(null);
  const [term, setTerm] = useState<any>(null);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Academic years" actions={<button className="btn-primary btn-sm" onClick={() => setEdit({ name: '', startDate: '', endDate: '' })}><Plus className="h-4 w-4" />Year</button>} bodyClass="p-0">
        <table className="min-w-full text-sm"><tbody className="divide-y">{lk?.years.map((y) => (
          <tr key={y.id}><td className="td font-medium">{y.name} {y.is_current && <Badge tone="green">current</Badge>}</td><td className="td">{fmtDate(y.start_date)} – {fmtDate(y.end_date)}</td><td className="td"><StatusBadge status={y.status} /></td>
            <td className="td whitespace-nowrap text-right"><button className="link mr-3" onClick={() => setEdit({ id: y.id, name: y.name, startDate: y.start_date, endDate: y.end_date, status: y.status })}>Edit</button>
              {!y.is_current && <DeleteButton className="link mr-3 text-red-600" url={`/api/settings/years/${y.id}`} what={`Academic year ${y.name}`} />}
              {!y.is_current && <button className="link" onClick={async () => { if (await confirm({ title: 'Make current year', message: `Switch the whole school to ${y.name}? Dashboards, attendance and portals will use this year.` })) run(() => api.post(`/api/settings/years/${y.id}/make-current`)); }}>Make current</button>}</td></tr>))}</tbody></table>
      </Card>
      <Card title="Terms" actions={<button className="btn-primary btn-sm" onClick={() => setTerm({ academicYearId: lk?.years.find((y) => y.is_current)?.id ?? '', name: '', startDate: '', endDate: '' })}><Plus className="h-4 w-4" />Term</button>} bodyClass="p-0">
        <table className="min-w-full text-sm"><tbody className="divide-y">{lk?.terms.map((tt) => (
          <tr key={tt.id}><td className="td">{lk.years.find((y) => y.id === tt.academic_year_id)?.name}</td><td className="td font-medium">{tt.name}</td><td className="td">{fmtDate(tt.start_date)} – {fmtDate(tt.end_date)}</td>
            <td className="td text-right"><button className="text-red-600" aria-label="Delete" onClick={async () => { if (await confirm({ title: 'Delete term', message: tt.name, danger: true })) run(() => api.del(`/api/settings/terms/${tt.id}`)); }}><Trash2 className="h-4 w-4" /></button></td></tr>))}
          {!lk?.terms.length && <tr><td className="td text-slate-500">—</td></tr>}</tbody></table>
      </Card>
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? 'Edit academic year' : 'New academic year'} footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={async () => { if (await run(() => (edit.id ? api.put(`/api/settings/years/${edit.id}`, edit) : api.post('/api/settings/years', edit)))) setEdit(null); }}>Save</button></>}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Name" hint="e.g. 2026-27" error={fieldErrors.name}><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Start" error={fieldErrors.startDate}><input type="date" className="input" value={edit.startDate} onChange={(e) => setEdit({ ...edit, startDate: e.target.value })} /></Field>
            <Field label="End" error={fieldErrors.endDate}><input type="date" className="input" value={edit.endDate} onChange={(e) => setEdit({ ...edit, endDate: e.target.value })} /></Field>
            {edit.id && <Field label="Status"><select className="input" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="planned">planned</option><option value="active">active</option><option value="closed">closed</option></select></Field>}
          </div>
          <p className="mt-3 text-xs text-slate-500">The first year you create becomes the current year. Create the next year before promoting students.</p>
        </Modal>
      )}
      {term && (
        <Modal open onClose={() => setTerm(null)} title="New term" footer={<><button className="btn-secondary" onClick={() => setTerm(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={async () => { if (await run(() => api.post('/api/settings/terms', term))) setTerm(null); }}>Save</button></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Academic year"><select className="input" value={term.academicYearId} onChange={(e) => setTerm({ ...term, academicYearId: e.target.value })}>{lk?.years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></Field>
            <Field label="Name"><input className="input" value={term.name} onChange={(e) => setTerm({ ...term, name: e.target.value })} placeholder="Term 1" /></Field>
            <Field label="Start"><input type="date" className="input" value={term.startDate} onChange={(e) => setTerm({ ...term, startDate: e.target.value })} /></Field>
            <Field label="End"><input type="date" className="input" value={term.endDate} onChange={(e) => setTerm({ ...term, endDate: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SimpleList({ title, path, rows }: { title: string; path: string; rows: any[] }) {
  const [edit, setEdit] = useState<any>(null);
  const { run, busy, fieldErrors } = useAction();
  return (
    <Card title={title} actions={<button className="btn-primary btn-sm" onClick={() => setEdit({ code: '', name: '', isActive: true })}><Plus className="h-4 w-4" />Add</button>} bodyClass="p-0">
      <table className="min-w-full text-sm"><tbody className="divide-y">{rows.map((r) => <tr key={r.id}><td className="td font-mono">{r.code}</td><td className="td">{r.name}</td><td className="td">{r.is_active ? '' : <Badge>inactive</Badge>}</td>
        <td className="td whitespace-nowrap text-right"><button className="link mr-3" onClick={() => setEdit({ id: r.id, code: r.code, name: r.name, isActive: r.is_active })}>Edit</button><DeleteButton url={`${path}/${r.id}`} what={r.name} /></td></tr>)}</tbody></table>
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={title} footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={async () => { if (await run(() => (edit.id ? api.put(`${path}/${edit.id}`, edit) : api.post(path, edit)))) setEdit(null); }}>Save</button></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Code" error={fieldErrors.code}><input className="input" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Name" error={fieldErrors.name}><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} />Active</label>
          </div>
        </Modal>
      )}
    </Card>
  );
}
function Boards() {
  const { lk } = useLookups();
  return <div className="grid gap-4 lg:grid-cols-2"><SimpleList title="Boards" path="/api/settings/boards" rows={lk?.boards ?? []} /><SimpleList title="Teaching mediums" path="/api/settings/mediums" rows={lk?.mediums ?? []} /></div>;
}

function Grading() {
  const q = useApi<any[]>('/api/settings/grading');
  const { lk } = useLookups();
  const [edit, setEdit] = useState<any>(null);
  const [dom, setDom] = useState<any>(null);
  const { run, busy } = useAction();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Grading scales" actions={<button className="btn-primary btn-sm" onClick={() => setEdit({ id: 'new', name: '', isDefault: false, bands: [{ minPercent: 0, grade: 'E', gradePoint: 0, remark: '' }] })}><Plus className="h-4 w-4" />Scale</button>}>
        <Async q={q}>{(scales) => <div className="space-y-4">{scales.map((s) => (
          <div key={s.id}><div className="flex justify-between"><p className="font-medium">{s.name} {s.is_default && <Badge tone="green">default</Badge>}</p><span className="flex gap-3"><button className="link text-sm" onClick={() => setEdit({ id: s.id, name: s.name, isDefault: s.is_default, bands: s.bands.map((b: any) => ({ minPercent: b.min_percent, grade: b.grade, gradePoint: b.grade_point, remark: b.remark ?? '' })) })}>Edit</button>{!s.is_default && <DeleteButton className="link text-sm text-red-600" url={`/api/settings/grading/${s.id}`} what={`Grading scale "${s.name}"`} />}</span></div>
            <p className="text-sm text-slate-600">{s.bands.map((b: any) => `${b.grade} ≥ ${b.min_percent}%`).join(' · ')}</p></div>))}</div>}</Async>
      </Card>
      <Card title="Preschool assessment areas" actions={<button className="btn-primary btn-sm" onClick={() => setDom({ name: '', nameHi: '', sortOrder: (lk?.domains.length ?? 0) + 1, isActive: true })}><Plus className="h-4 w-4" />Area</button>} bodyClass="p-0">
        <table className="min-w-full text-sm"><tbody className="divide-y">{lk?.domains.map((d) => <tr key={d.id}><td className="td">{d.sort_order}</td><td className="td">{d.name}</td><td className="td">{d.name_hi}</td><td className="td">{d.is_active ? '' : <Badge>inactive</Badge>}</td>
          <td className="td whitespace-nowrap text-right"><button className="link mr-3" onClick={() => setDom({ id: d.id, name: d.name, nameHi: d.name_hi ?? '', sortOrder: d.sort_order, isActive: d.is_active })}>Edit</button><DeleteButton url={`/api/settings/domains/${d.id}`} what={d.name} /></td></tr>)}</tbody></table>
      </Card>
      {edit && (
        <Modal open size="lg" onClose={() => setEdit(null)} title="Grading scale" footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={async () => { if (await run(() => api.put(`/api/settings/grading/${edit.id}`, edit))) setEdit(null); }}>Save</button></>}>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Name"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.isDefault} onChange={(e) => setEdit({ ...edit, isDefault: e.target.checked })} />Default scale</label></div>
          <div className="mt-4 space-y-2">{edit.bands.map((b: any, i: number) => { const u = (k: string, val: any) => setEdit({ ...edit, bands: edit.bands.map((x: any, j: number) => (j === i ? { ...x, [k]: val } : x)) }); return (
            <div key={i} className="flex flex-wrap items-center gap-2"><input className="input w-20" placeholder="Grade" value={b.grade} onChange={(e) => u('grade', e.target.value)} />
              <label className="text-xs">from %<input className="input w-20" type="number" value={b.minPercent} onChange={(e) => u('minPercent', e.target.value)} /></label>
              <label className="text-xs">GP<input className="input w-20" type="number" value={b.gradePoint ?? ''} onChange={(e) => u('gradePoint', e.target.value)} /></label>
              <input className="input w-40" placeholder="Remark" value={b.remark} onChange={(e) => u('remark', e.target.value)} />
              <button className="text-red-600" aria-label="Remove" onClick={() => setEdit({ ...edit, bands: edit.bands.filter((_: any, j: number) => j !== i) })}><Trash2 className="h-4 w-4" /></button></div>); })}
            <button className="btn-secondary btn-sm" onClick={() => setEdit({ ...edit, bands: [...edit.bands, { minPercent: '', grade: '', gradePoint: '', remark: '' }] })}><Plus className="h-4 w-4" />Band</button></div>
        </Modal>
      )}
      {dom && (
        <Modal open onClose={() => setDom(null)} title="Assessment area" footer={<><button className="btn-secondary" onClick={() => setDom(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={async () => { if (await run(() => (dom.id ? api.put(`/api/settings/domains/${dom.id}`, dom) : api.post('/api/settings/domains', dom)))) setDom(null); }}>Save</button></>}>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Name"><input className="input" value={dom.name} onChange={(e) => setDom({ ...dom, name: e.target.value })} /></Field>
            <Field label="Hindi name"><input className="input" value={dom.nameHi} onChange={(e) => setDom({ ...dom, nameHi: e.target.value })} /></Field>
            <Field label="Order"><input className="input" type="number" value={dom.sortOrder} onChange={(e) => setDom({ ...dom, sortOrder: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dom.isActive} onChange={(e) => setDom({ ...dom, isActive: e.target.checked })} />Active</label></div>
        </Modal>
      )}
    </div>
  );
}

function Messages() {
  const q = useApi<any>('/api/settings/messages');
  return (
    <Async q={q}>{(d) => (
      <div className="space-y-4">
        <Card title="Providers">
          <ul className="space-y-1 text-sm">{Object.entries(d.providers).map(([k, v]) => <li key={k}><b className="uppercase">{k}</b>: {v ? <Badge tone="green">configured</Badge> : <Badge tone="amber">not configured</Badge>}</li>)}</ul>
          <p className="mt-3 text-sm text-slate-600">SMS, WhatsApp and email need credentials from a provider (set as environment variables on the server — see README → Messaging). Until then, messages are recorded with status "not configured" and are <b>not</b> sent.</p>
        </Card>
        <Card title="Message log" bodyClass="p-0"><DataTable rows={d.messages} columns={[{ key: 'created_at', header: 'Date', render: (r) => fmtDateTime(r.created_at) }, { key: 'channel', header: 'Channel' }, { key: 'recipient', header: 'To' }, { key: 'body', header: 'Message', render: (r) => <span className="text-xs">{r.body}</span> }, { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> }]} /></Card>
      </div>
    )}</Async>
  );
}

function DemoData() {
  const q = useApi<any>('/api/settings/demo');
  const { confirm } = useUi();
  const { run, busy } = useAction();
  const [pw, setPw] = useState('');
  const [result, setResult] = useState<any>(null);
  return (
    <Async q={q}>{(st) => (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Sample data for demonstrations">
          <p className="text-sm text-slate-600">Loads a complete example school so you can show the system to others: 9 teachers, 2–3 students in every class from Nursery to Class 12 (day scholars and hostellers), timetable,
            a month of attendance, fee invoices and payments, published Unit Test results, hostel allocations, homework, quizzes, notices and events.</p>
          <p className="mt-2 text-sm text-slate-600">Every sample record is tagged, so <b>Remove sample data</b> deletes only these records — your real students, teachers and payments are never touched.</p>
          {st.loaded ? (
            <div className="mt-4 space-y-3">
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Sample data is loaded ({st.teachers} teachers, {st.students} students). Remove it before entering real school data.</p>
              <button className="btn-danger" disabled={busy} onClick={async () => { if (await confirm({ title: 'Remove sample data', message: 'Delete all sample teachers, students, fees, attendance, exams and notices? Real records are kept.', danger: true })) { await run(() => api.del('/api/settings/demo'), { success: 'Sample data removed.' }); setResult(null); } }}>Remove sample data</button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <Field label="Password for all sample accounts" hint="Teachers and students in the sample data will sign in with their ID and this password (min 6 characters)."><input className="input" type="text" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
              <button className="btn-primary" disabled={busy || pw.length < 6} onClick={async () => { const r = await run(() => api.post('/api/settings/demo', { password: pw }), { success: 'Sample data loaded.' }); if (r) setResult(r); }}>{busy ? 'Loading… (up to a minute)' : 'Load sample data'}</button>
            </div>
          )}
        </Card>
        {result && (
          <Card title="Sample logins" actions={<button className="btn-secondary btn-sm" onClick={() => window.print()}>Print</button>}>
            <div className="print-area text-sm">
              <p className="mb-2">Password for every account below: <b className="font-mono">{result.password}</b> · Sign in at {location.origin}/login</p>
              <h3 className="mt-3 font-semibold">Teachers</h3>
              <ul className="divide-y">{result.teachers.map((t: any) => <li key={t.username} className="flex justify-between py-1"><span>{t.name}</span><span className="font-mono">{t.username}</span></li>)}</ul>
              <h3 className="mt-3 font-semibold">Students (two per class)</h3>
              <ul className="divide-y">{result.students.map((s: any) => <li key={s.username} className="flex justify-between py-1"><span>{s.className} · {s.name}</span><span className="font-mono">{s.username}</span></li>)}</ul>
            </div>
          </Card>
        )}
      </div>
    )}</Async>
  );
}

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Async, Badge, Card, DeleteButton, Field, Modal, PageHeader, Tabs, useAction, useApi, useUi } from '../../components/ui';
import { DataTable } from '../../components/DataTable';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useLookups } from '../../lib/lookups';
import { fullName } from '../../lib/format';

export default function Classes() {
  const { t } = useI18n();
  const [tab, setTab] = useState<'sections' | 'subjects' | 'levels'>('sections');
  return (
    <>
      <PageHeader title={t('Classes & Sections')} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'sections', label: 'Sections' }, { key: 'subjects', label: 'Class subjects' }, { key: 'levels', label: 'Class levels' }]} />
      {tab === 'sections' && <Sections />}{tab === 'subjects' && <ClassSubjects />}{tab === 'levels' && <Levels />}
    </>
  );
}

function Sections() {
  const { t } = useI18n();
  const { lk, current } = useLookups();
  const [yearId, setYearId] = useState<number | null>(null);
  const y = yearId ?? current?.id ?? null;
  const q = useApi<any[]>(y ? `/api/academics/sections?yearId=${y}` : null);
  const teachers = useApi<any[]>('/api/teachers');
  const [edit, setEdit] = useState<any>(null);
  const { run, busy, fieldErrors } = useAction();
  const { confirm } = useUi();
  return (
    <Card bodyClass="p-0">
      {!current && <p className="p-4 text-sm text-amber-700">Create an academic year in Settings first.</p>}
      {q.data && (
        <DataTable rows={q.data} search={(r) => `${r.class_name} ${r.name} ${r.class_teacher_name ?? ''}`}
          toolbar={<>
            <select className="input w-36" value={y ?? ''} onChange={(e) => setYearId(Number(e.target.value))}>{lk?.years.map((yy) => <option key={yy.id} value={yy.id}>{yy.name}</option>)}</select>
            <button className="btn-secondary" disabled={busy || !y} onClick={() => run(() => api.post('/api/academics/sections/defaults', { academicYearId: y }), { success: 'Section A created for every class that had no section.' })}>Create sections for all classes</button>
            <button className="btn-primary" onClick={() => setEdit({ academicYearId: y, classLevelId: '', name: 'A', boardId: lk?.boards[0]?.id ?? '', mediumId: lk?.mediums[0]?.id ?? '', classTeacherId: '', capacity: '40', room: '' })}><Plus className="h-4 w-4" />Section</button>
          </>}
          columns={[
            { key: 'class', header: t('Class'), render: (r) => <span className="font-medium">{r.class_name} – {r.name} {r.is_preschool && <Badge tone="amber">{t('Preschool')}</Badge>} {!r.is_active && <Badge>inactive</Badge>}</span>, sortValue: (r) => r.sort_order * 100 + r.name.charCodeAt(0) },
            { key: 'board', header: `${t('Board')} / ${t('Medium')}`, render: (r) => `${r.board ?? '—'} / ${r.medium_name ?? '—'}` },
            { key: 'class_teacher_name', header: 'Class teacher' },
            { key: 'student_count', header: t('Students'), className: 'text-right', render: (r) => `${r.student_count}${r.capacity ? ` / ${r.capacity}` : ''}`, sortValue: (r) => r.student_count },
            { key: 'room', header: 'Room' },
            { key: 'roll', header: 'Roll numbers', sortable: false, render: (r) => r.student_count > 0 && <button className="link text-xs" onClick={async () => { if (await confirm({ title: `Roll numbers – ${r.class_name} ${r.name}`, message: 'Re-number all students 1, 2, 3… in alphabetical order of name? The change is recorded in the audit log.' })) run(() => api.post(`/api/academics/sections/${r.id}/renumber`, { order: 'alphabetical' }), { success: 'Roll numbers updated alphabetically.' }); }}>A–Z re-number</button> },
            { key: 'e', header: '', sortable: false, render: (r) => <span className="flex gap-3"><button className="link" onClick={() => setEdit({ id: r.id, name: r.name, boardId: r.board_id ?? '', mediumId: r.medium_id ?? '', classTeacherId: r.class_teacher_id ?? '', capacity: r.capacity ?? '', room: r.room ?? '', isActive: r.is_active })}>{t('Edit')}</button><DeleteButton url={`/api/academics/sections/${r.id}`} what={`Section ${r.class_name} – ${r.name}`} /></span> },
          ]} />
      )}
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? 'Edit section' : 'New section'} footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>{t('Cancel')}</button>
          <button className="btn-primary" disabled={busy} onClick={async () => {
            const body = { ...edit, classTeacherId: edit.classTeacherId || null, boardId: edit.boardId || null, mediumId: edit.mediumId || null, capacity: edit.capacity || null };
            if (await run(() => (edit.id ? api.put(`/api/academics/sections/${edit.id}`, body) : api.post('/api/academics/sections', body)))) setEdit(null);
          }}>{t('Save')}</button></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            {!edit.id && <Field label={t('Class')} required error={fieldErrors.classLevelId}><select className="input" value={edit.classLevelId} onChange={(e) => setEdit({ ...edit, classLevelId: e.target.value })}><option value="">—</option>{lk?.classes.filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
            <Field label="Section name" required error={fieldErrors.name}><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label={t('Board')}><select className="input" value={edit.boardId} onChange={(e) => setEdit({ ...edit, boardId: e.target.value })}><option value="">—</option>{lk?.boards.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}</select></Field>
            <Field label={t('Medium')}><select className="input" value={edit.mediumId} onChange={(e) => setEdit({ ...edit, mediumId: e.target.value })}><option value="">—</option>{lk?.mediums.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
            <Field label="Class teacher"><select className="input" value={edit.classTeacherId} onChange={(e) => setEdit({ ...edit, classTeacherId: e.target.value })}><option value="">—</option>{teachers.data?.map((x) => <option key={x.id} value={x.id}>{fullName(x)} ({x.employee_code})</option>)}</select></Field>
            <Field label="Capacity" error={fieldErrors.capacity}><input className="input" type="number" min={1} value={edit.capacity} onChange={(e) => setEdit({ ...edit, capacity: e.target.value })} /></Field>
            <Field label="Room"><input className="input" value={edit.room} onChange={(e) => setEdit({ ...edit, room: e.target.value })} /></Field>
            {edit.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} />Active</label>}
          </div>
        </Modal>
      )}
    </Card>
  );
}

function ClassSubjects() {
  const { lk, current } = useLookups();
  const [classId, setClassId] = useState('');
  const cs = useApi<any[]>(current ? `/api/academics/class-subjects?yearId=${current.id}` : null);
  const [sel, setSel] = useState<Record<number, { on: boolean; optional: boolean }>>({});
  const { run, busy } = useAction();
  useEffect(() => {
    if (!cs.data || !classId) return;
    setSel(Object.fromEntries(cs.data.filter((c) => c.class_level_id === Number(classId)).map((c) => [c.subject_id, { on: true, optional: c.is_optional }])));
  }, [cs.data, classId]);
  return (
    <Card title={<select className="input" value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Class"><option value="">Choose a class…</option>{lk?.classes.filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
      actions={classId && <button className="btn-primary" disabled={busy} onClick={() => run(() => api.put('/api/academics/class-subjects', { academicYearId: current!.id, classLevelId: Number(classId), subjects: Object.entries(sel).filter(([, v]) => v.on).map(([k, v]) => ({ subjectId: Number(k), isOptional: v.optional })) }))}>Save</button>}>
      {!classId ? <p className="text-sm text-slate-500">Subjects taught in each class for {current?.name}. Teachers can only be assigned to subjects mapped here.</p> : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{lk?.subjects.filter((s) => s.is_active).map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!sel[s.id]?.on} onChange={(e) => setSel({ ...sel, [s.id]: { on: e.target.checked, optional: sel[s.id]?.optional ?? false } })} />{s.name}</label>
            {sel[s.id]?.on && <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={sel[s.id].optional} onChange={(e) => setSel({ ...sel, [s.id]: { on: true, optional: e.target.checked } })} />optional</label>}
          </div>))}</div>
      )}
    </Card>
  );
}

function Levels() {
  const { lk } = useLookups();
  const [edit, setEdit] = useState<any>(null);
  const { run, busy, fieldErrors } = useAction();
  return (
    <Card bodyClass="p-0">
      {lk && <DataTable rows={lk.classes} toolbar={<button className="btn-primary" onClick={() => setEdit({ name: '', nameHi: '', code: '', sortOrder: (lk.classes.at(-1)?.sort_order ?? 0) + 1, isPreschool: false, isActive: true })}><Plus className="h-4 w-4" />Class level</button>}
        columns={[{ key: 'sort_order', header: 'Order' }, { key: 'name', header: 'Name' }, { key: 'name_hi', header: 'Hindi name' }, { key: 'code', header: 'Code' },
          { key: 'p', header: 'Type', render: (r) => r.is_preschool ? <Badge tone="amber">Preschool</Badge> : 'School' }, { key: 'a', header: 'Active', render: (r) => (r.is_active ? 'Yes' : 'No') },
          { key: 'e', header: '', sortable: false, render: (r) => <span className="flex gap-3"><button className="link" onClick={() => setEdit({ id: r.id, name: r.name, nameHi: r.name_hi ?? '', code: r.code, sortOrder: r.sort_order, isPreschool: r.is_preschool, isActive: r.is_active })}>Edit</button><DeleteButton url={`/api/settings/classes/${r.id}`} what={`Class "${r.name}"`} /></span> }]} />}
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? 'Edit class level' : 'New class level'} footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={async () => { if (await run(() => (edit.id ? api.put(`/api/settings/classes/${edit.id}`, edit) : api.post('/api/settings/classes', edit)))) setEdit(null); }}>Save</button></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" error={fieldErrors.name}><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Hindi name"><input className="input" value={edit.nameHi} onChange={(e) => setEdit({ ...edit, nameHi: e.target.value })} /></Field>
            <Field label="Code" hint="Short code used in roll-number login, e.g. 5 or LKG" error={fieldErrors.code}><input className="input" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></Field>
            <Field label="Sort order"><input className="input" type="number" value={edit.sortOrder} onChange={(e) => setEdit({ ...edit, sortOrder: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.isPreschool} onChange={(e) => setEdit({ ...edit, isPreschool: e.target.checked })} />Preschool level (preschool fees & descriptive assessment)</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} />Active</label>
          </div>
        </Modal>
      )}
    </Card>
  );
}

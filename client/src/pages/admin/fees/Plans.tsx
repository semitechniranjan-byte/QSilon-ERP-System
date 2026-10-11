import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Async, Badge, Card, Field, Modal, PageHeader, Tabs, useAction, useApi } from '../../../components/ui';
import { DataTable } from '../../../components/DataTable';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import { useLookups } from '../../../lib/lookups';
import { inr, paiseToRupeeStr } from '../../../lib/format';

const FREQ = [['one_time', 'One-time'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['half_yearly', 'Half-yearly'], ['annual', 'Annual']];

export default function Plans() {
  const { t } = useI18n();
  const [tab, setTab] = useState<'plans' | 'categories'>('plans');
  return (
    <>
      <PageHeader title={t('Fee Plans')} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'plans', label: t('Fee Plans') }, { key: 'categories', label: 'Fee categories' }]} />
      {tab === 'plans' ? <PlanList /> : <Categories />}
    </>
  );
}

function PlanList() {
  const { can } = useAuth();
  const { lk, current, sectionsFor, sectionLabel } = useLookups();
  const [yearId, setYearId] = useState<number | null>(null);
  const y = yearId ?? current?.id;
  const q = useApi<any[]>(y ? `/api/fees/plans?yearId=${y}` : null);
  const [edit, setEdit] = useState<any>(null);
  const [assign, setAssign] = useState<any>(null);
  const { run, busy, fieldErrors } = useAction();
  const students = useApi<any[]>(assign?.sectionId ? `/api/academics/sections/${assign.sectionId}/students` : null);
  const cats = (lk?.categories ?? []).filter((c) => c.is_active && c.kind !== 'transport');
  return (
    <>
      <div className="mb-3 flex flex-wrap justify-between gap-2">
        <select className="input w-36" value={y ?? ''} onChange={(e) => setYearId(Number(e.target.value))} aria-label="Year">{lk?.years.map((yy) => <option key={yy.id} value={yy.id}>{yy.name}</option>)}</select>
        {can('fees.manage') && <button className="btn-primary" onClick={() => setEdit({ academicYearId: y, name: '', planType: 'school', classLevelId: '', description: '', isActive: true, items: [] })}><Plus className="h-4 w-4" />Fee plan</button>}
      </div>
      <Async q={q}>{(plans) => (
        <div className="grid gap-4 lg:grid-cols-2">
          {plans.map((p) => (
            <Card key={p.id} title={<span>{p.name} <Badge tone={p.plan_type === 'preschool' ? 'amber' : p.plan_type === 'hostel' ? 'purple' : 'blue'}>{p.plan_type}</Badge> {!p.is_active && <Badge>inactive</Badge>}</span>}
              actions={can('fees.manage') && <><button className="btn-secondary btn-sm" onClick={() => setAssign({ plan: p, sectionId: '', ids: [] })}>Assign</button>
                <button className="btn-secondary btn-sm" onClick={() => setEdit({ id: p.id, academicYearId: p.academic_year_id, name: p.name, planType: p.plan_type, classLevelId: p.class_level_id ?? '', description: p.description ?? '', isActive: p.is_active,
                  items: p.items.map((i: any) => ({ feeCategoryId: i.fee_category_id, amount: paiseToRupeeStr(i.amount_paise), frequency: i.frequency, dueDay: i.due_day })) })}>Edit</button></>}>
              <p className="mb-2 text-xs text-slate-500">{p.class_name ?? 'Any class'} · {p.students} student(s){p.description ? ` · ${p.description}` : ''}</p>
              <table className="min-w-full text-sm"><tbody className="divide-y">{p.items.map((i: any) => <tr key={i.id}><td className="py-1.5">{i.category_name}</td><td className="py-1.5 text-slate-500">{i.frequency.replace('_', ' ')}</td><td className="py-1.5 text-right font-medium">{inr(i.amount_paise)}</td></tr>)}</tbody></table>
            </Card>
          ))}
          {!plans.length && <Card><p className="text-sm text-slate-500">No fee plans for this year yet. Create separate plans for preschool, each school class, and hostel residents. Transport is charged from routes.</p></Card>}
        </div>
      )}</Async>
      {edit && (
        <Modal open size="lg" onClose={() => setEdit(null)} title={edit.id ? 'Edit fee plan' : 'New fee plan'} footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={async () => { const body = { ...edit, classLevelId: edit.classLevelId || null }; if (await run(() => (edit.id ? api.put(`/api/fees/plans/${edit.id}`, body) : api.post('/api/fees/plans', body)))) setEdit(null); }}>Save</button></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Plan name" error={fieldErrors.name}><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Class 5 – 2026-27" /></Field>
            <Field label="Type" hint="Hostel plans are added on top of a base plan for hostel residents."><select className="input" value={edit.planType} onChange={(e) => setEdit({ ...edit, planType: e.target.value })}><option value="school">School (Class 1–12)</option><option value="preschool">Preschool</option><option value="hostel">Hostel add-on / package</option></select></Field>
            <Field label="Class (optional)"><select className="input" value={edit.classLevelId} onChange={(e) => setEdit({ ...edit, classLevelId: e.target.value })}><option value="">Any class</option>{lk?.classes.filter((c) => edit.planType === 'hostel' || c.is_preschool === (edit.planType === 'preschool')).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Description"><input className="input" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            {edit.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} />Active</label>}
          </div>
          <h3 className="mb-2 mt-5 text-sm font-semibold">Fee items</h3>
          <div className="space-y-2">{edit.items.map((it: any, i: number) => {
            const upd = (k: string, v: any) => setEdit({ ...edit, items: edit.items.map((x: any, j: number) => (j === i ? { ...x, [k]: v } : x)) });
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select className="input w-52" value={it.feeCategoryId} onChange={(e) => { const c = cats.find((cc) => cc.id === Number(e.target.value)); upd('feeCategoryId', Number(e.target.value)); if (c) setTimeout(() => upd('frequency', c.default_frequency)); }}>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                <input className="input w-32" inputMode="decimal" placeholder="₹" value={it.amount} onChange={(e) => upd('amount', e.target.value)} aria-label="Amount" />
                <select className="input w-36" value={it.frequency} onChange={(e) => upd('frequency', e.target.value)}>{FREQ.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <label className="flex items-center gap-1 text-xs text-slate-500">Due day<input className="input w-16" type="number" min={1} max={28} value={it.dueDay} onChange={(e) => upd('dueDay', Number(e.target.value))} /></label>
                <button className="btn-ghost btn-sm text-red-600" onClick={() => setEdit({ ...edit, items: edit.items.filter((_: any, j: number) => j !== i) })} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
              </div>);
          })}
            <button className="btn-secondary btn-sm" onClick={() => { const c = cats.find((cc) => !edit.items.some((x: any) => x.feeCategoryId === cc.id)) ?? cats[0]; setEdit({ ...edit, items: [...edit.items, { feeCategoryId: c?.id, amount: '', frequency: c?.default_frequency ?? 'monthly', dueDay: 10 }] }); }}><Plus className="h-4 w-4" />Item</button>
          </div>
          <p className="mt-3 text-xs text-slate-500">Uniform/dress and admission are normally one-time (charged once per student). Books are usually annual. Editing a plan affects only invoices generated afterwards.</p>
        </Modal>
      )}
      {assign && (
        <Modal open size="lg" onClose={() => setAssign(null)} title={`Assign "${assign.plan.name}"`} footer={<><button className="btn-secondary" onClick={() => setAssign(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy || !assign.ids.length} onClick={async () => { if (await run(() => api.post(`/api/fees/plans/${assign.plan.id}/assign`, { enrollmentIds: assign.ids }))) setAssign(null); }}>Assign to {assign.ids.length}</button></>}>
          <Field label="Section"><select className="input" value={assign.sectionId} onChange={(e) => setAssign({ ...assign, sectionId: e.target.value, ids: [] })}><option value="">—</option>{sectionsFor(assign.plan.academic_year_id).map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}</select></Field>
          {students.data && (
            <div className="mt-3">
              <label className="mb-2 flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={assign.ids.length === students.data.filter((s) => assign.plan.plan_type !== 'hostel' || s.residency === 'hostel').length && assign.ids.length > 0} onChange={(e) => setAssign({ ...assign, ids: e.target.checked ? students.data!.filter((s) => s.enrollment_status === 'active' && (assign.plan.plan_type !== 'hostel' || s.residency === 'hostel')).map((s) => s.enrollment_id) : [] })} />Select all eligible</label>
              <div className="grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2">{students.data.filter((s) => s.enrollment_status === 'active').map((s) => { const ok = assign.plan.plan_type !== 'hostel' || s.residency === 'hostel'; return (
                <label key={s.enrollment_id} className={`flex items-center gap-2 text-sm ${ok ? '' : 'opacity-40'}`}><input type="checkbox" disabled={!ok} checked={assign.ids.includes(s.enrollment_id)} onChange={(e) => setAssign({ ...assign, ids: e.target.checked ? [...assign.ids, s.enrollment_id] : assign.ids.filter((x: number) => x !== s.enrollment_id) })} />{s.roll_no}. {s.first_name} {s.last_name}</label>); })}</div>
              <p className="mt-2 text-xs text-slate-500">Replaces any existing {assign.plan.plan_type} plan for the selected students.</p>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

function Categories() {
  const { can } = useAuth();
  const { lk } = useLookups();
  const [edit, setEdit] = useState<any>(null);
  const { run, busy, fieldErrors } = useAction();
  return (
    <Card bodyClass="p-0">
      {lk && <DataTable rows={lk.categories} toolbar={can('fees.manage') && <button className="btn-primary" onClick={() => setEdit({ code: '', name: '', nameHi: '', kind: 'other', defaultFrequency: 'one_time', isActive: true })}><Plus className="h-4 w-4" />Category</button>}
        columns={[{ key: 'code', header: 'Code' }, { key: 'name', header: 'Name' }, { key: 'name_hi', header: 'Hindi' }, { key: 'kind', header: 'Kind' }, { key: 'default_frequency', header: 'Default billing' }, { key: 'a', header: 'Active', render: (r) => (r.is_active ? 'Yes' : 'No') },
          { key: 'e', header: '', sortable: false, render: (r) => can('fees.manage') && <button className="link" onClick={() => setEdit({ id: r.id, code: r.code, name: r.name, nameHi: r.name_hi ?? '', kind: r.kind, defaultFrequency: r.default_frequency, isActive: r.is_active })}>Edit</button> }]} />}
      {edit && (
        <Modal open onClose={() => setEdit(null)} title="Fee category" footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={async () => { if (await run(() => (edit.id ? api.put(`/api/fees/categories/${edit.id}`, edit) : api.post('/api/fees/categories', edit)))) setEdit(null); }}>Save</button></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Code" error={fieldErrors.code}><input className="input" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Name" error={fieldErrors.name}><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Hindi name"><input className="input" value={edit.nameHi} onChange={(e) => setEdit({ ...edit, nameHi: e.target.value })} /></Field>
            <Field label="Kind"><select className="input" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>{['admission', 'tuition', 'preschool_course', 'annual', 'exam', 'hostel', 'transport', 'uniform', 'books', 'activity', 'other'].map((k) => <option key={k}>{k}</option>)}</select></Field>
            <Field label="Default billing"><select className="input" value={edit.defaultFrequency} onChange={(e) => setEdit({ ...edit, defaultFrequency: e.target.value })}>{FREQ.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} />Active</label>
          </div>
        </Modal>
      )}
    </Card>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, Send } from 'lucide-react';
import { Async, Card, Field, Modal, PageHeader, Tabs, useAction, useApi } from '../../../components/ui';
import { DataTable } from '../../../components/DataTable';
import { api, qs } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import { useLookups } from '../../../lib/lookups';
import { fmtDate, fullName, inr, todayISO } from '../../../lib/format';

export default function FeeReports() {
  const { t } = useI18n();
  const [tab, setTab] = useState<'collections' | 'outstanding'>('collections');
  return (
    <>
      <PageHeader title={`${t('Fees')} – ${t('Reports')}`} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'collections', label: 'Collections' }, { key: 'outstanding', label: 'Outstanding & overdue' }]} />
      {tab === 'collections' ? <Collections /> : <Outstanding />}
    </>
  );
}

function Collections() {
  const { t } = useI18n();
  const first = todayISO().slice(0, 8) + '01';
  const [r, setR] = useState({ from: first, to: todayISO() });
  const q = useApi<any>(`/api/fees/reports/collections${qs(r)}`);
  return (
    <>
      <Card className="mb-4"><div className="flex flex-wrap items-end gap-3">
        <Field label="From"><input type="date" className="input" value={r.from} onChange={(e) => setR({ ...r, from: e.target.value })} /></Field>
        <Field label="To"><input type="date" className="input" value={r.to} onChange={(e) => setR({ ...r, to: e.target.value })} /></Field>
        <button className="btn-secondary" onClick={() => setR({ from: todayISO(), to: todayISO() })}>Today</button>
        <a className="btn-secondary" href={`/api/reports/collections${qs({ ...r, format: 'xlsx' })}`}><Download className="h-4 w-4" />{t('Export Excel')}</a>
        <a className="btn-secondary" href={`/api/reports/collections${qs({ ...r, format: 'csv' })}`}>{t('Export CSV')}</a>
      </div></Card>
      <Async q={q}>{(d) => (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <div className="card p-4"><p className="text-xs uppercase text-slate-500">Collected</p><p className="text-2xl font-semibold">{inr(d.totals.collected)}</p><p className="text-xs text-slate-500">{d.totals.payments} payments</p></div>
            <div className="card p-4"><p className="text-xs uppercase text-slate-500">Refunded</p><p className="text-2xl font-semibold text-red-700">{inr(d.totals.refunded)}</p></div>
            <div className="card p-4"><p className="text-xs uppercase text-slate-500">Net</p><p className="text-2xl font-semibold">{inr(d.totals.collected - d.totals.refunded)}</p></div>
          </div>
          <Card title="Date-wise income">
            <div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={d.daily.map((x: any) => ({ date: fmtDate(x.date).slice(0, 5), amount: x.amount_paise / 100 }))}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} width={60} /><Tooltip formatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`} /><Bar dataKey="amount" fill="#2d6fae" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
          </Card>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="By payment mode"><ul className="divide-y text-sm">{d.byMode.map((m: any) => <li key={m.mode} className="flex justify-between py-1.5"><span className="capitalize">{m.mode.replace('_', ' ')} ({m.payments})</span><b>{inr(m.amount_paise)}</b></li>)}</ul></Card>
            <Card title="Class-wise"><ul className="divide-y text-sm">{d.byClass.map((m: any) => <li key={m.class_name} className="flex justify-between py-1.5"><span>{m.class_name}</span><b>{inr(m.amount_paise)}</b></li>)}</ul></Card>
            <Card title="By category"><ul className="divide-y text-sm">{d.byCategory.map((m: any) => <li key={m.category} className="flex justify-between py-1.5"><span>{m.category}</span><b>{inr(m.amount_paise)}</b></li>)}</ul></Card>
          </div>
        </div>
      )}</Async>
    </>
  );
}

function Outstanding() {
  const { t } = useI18n();
  const { can } = useAuth();
  const { current, sectionsFor, sectionLabel } = useLookups();
  const [f, setF] = useState({ sectionId: '', overdueOnly: '' });
  const q = useApi<any>(`/api/fees/reports/outstanding${qs(f)}`);
  const [remind, setRemind] = useState<any>(null);
  const { run, busy } = useAction();
  return (
    <>
      <Card className="mb-4"><div className="flex flex-wrap items-end gap-3">
        <Field label={t('Section')}><select className="input" value={f.sectionId} onChange={(e) => setF({ ...f, sectionId: e.target.value })}><option value="">{t('All')}</option>{sectionsFor(current?.id).map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}</select></Field>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={!!f.overdueOnly} onChange={(e) => setF({ ...f, overdueOnly: e.target.checked ? 'true' : '' })} />Overdue only</label>
        <a className="btn-secondary" href={`/api/reports/outstanding${qs({ sectionId: f.sectionId, format: 'xlsx' })}`}><Download className="h-4 w-4" />{t('Export Excel')}</a>
      </div></Card>
      <Async q={q}>{(d) => (
        <div className="space-y-4">
          <Card title="Class-wise summary" bodyClass="p-0"><table className="min-w-full text-sm"><thead className="bg-slate-50"><tr><th className="th">{t('Class')}</th><th className="th text-right">Billed</th><th className="th text-right">{t('Paid')}</th><th className="th text-right">{t('Outstanding')}</th></tr></thead>
            <tbody className="divide-y">{d.byClass.map((c: any) => <tr key={c.class_name}><td className="td">{c.class_name}</td><td className="td text-right">{inr(c.billed_paise)}</td><td className="td text-right">{inr(c.paid_paise)}</td><td className="td text-right font-medium text-amber-700">{inr(c.outstanding_paise)}</td></tr>)}</tbody></table></Card>
          <Card title={`${d.students.length} students with dues`} bodyClass="p-0" actions={can('fees.manage') && d.students.length > 0 && <button className="btn-secondary btn-sm" onClick={() => setRemind({ channel: 'sms', ids: d.students.map((s: any) => s.student_id) })}><Send className="h-4 w-4" />Send reminders</button>}>
            <DataTable rows={d.students} rowKey={(r) => r.student_id} search={(r) => `${fullName(r)} ${r.student_code}`} columns={[
              { key: 'name', header: t('Name'), render: (r) => <Link className="link" to={`/admin/fees/student/${r.student_id}`}>{fullName(r)}</Link>, sortValue: fullName },
              { key: 'class', header: t('Class'), render: (r) => `${r.class_name} ${r.section_name} · ${r.roll_no}` },
              { key: 'guardian_phone', header: t('Phone') },
              { key: 'billed_paise', header: 'Billed', className: 'text-right', render: (r) => inr(r.billed_paise) },
              { key: 'paid_paise', header: t('Paid'), className: 'text-right', render: (r) => inr(r.paid_paise) },
              { key: 'outstanding_paise', header: t('Outstanding'), className: 'text-right', render: (r) => <b className="text-amber-700">{inr(r.outstanding_paise)}</b>, sortValue: (r) => r.outstanding_paise },
              { key: 'overdue_paise', header: t('Overdue'), className: 'text-right', render: (r) => (r.overdue_paise ? <span className="text-red-600">{inr(r.overdue_paise)}</span> : '—'), sortValue: (r) => r.overdue_paise ?? 0 },
              { key: 'oldest_due', header: 'Oldest due', render: (r) => fmtDate(r.oldest_due) },
            ]} />
          </Card>
        </div>
      )}</Async>
      {remind && (
        <Modal open onClose={() => setRemind(null)} title="Send fee reminders" footer={<><button className="btn-secondary" onClick={() => setRemind(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={async () => { const r = await run(() => api.post('/api/fees/reminders', { studentIds: remind.ids, channel: remind.channel, message: remind.message || null }), { success: false }); if (r) setRemind({ ...remind, result: r }); }}>Queue {remind.ids.length}</button></>}>
          {remind.result ? <p className={`rounded-lg p-3 text-sm ${remind.result.providerConfigured ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{remind.result.queued} recorded, {remind.result.skipped} skipped (no contact or nothing due). {remind.result.note}</p> : (
            <div className="grid gap-3">
              <Field label="Channel"><select className="input" value={remind.channel} onChange={(e) => setRemind({ ...remind, channel: e.target.value })}><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select></Field>
              <Field label="Custom message (optional)" hint="Default: amount due and school name."><textarea className="input" rows={3} value={remind.message ?? ''} onChange={(e) => setRemind({ ...remind, message: e.target.value })} /></Field>
              <p className="text-xs text-slate-500">Messages are marked sent only when a configured provider confirms delivery. Without a provider they are recorded as "not configured".</p>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

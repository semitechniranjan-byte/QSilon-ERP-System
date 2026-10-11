import { useEffect, useMemo, useState } from 'react';
import { Card, Field, PageHeader, useAction, useApi, useUi } from '../../components/ui';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useLookups } from '../../lib/lookups';
import { fullName } from '../../lib/format';

export default function Promotion() {
  const { t } = useI18n();
  const { lk, current, sectionsFor, sectionLabel } = useLookups();
  const { confirm } = useUi();
  const { run, busy } = useAction();
  const [fromSection, setFromSection] = useState('');
  const [toYear, setToYear] = useState('');
  const students = useApi<any[]>(fromSection ? `/api/academics/sections/${fromSection}/students` : null);
  const [rows, setRows] = useState<Record<number, { action: string; toSectionId: string }>>({});
  const src = sectionsFor(current?.id).find((s) => String(s.id) === fromSection);
  const targets = sectionsFor(toYear ? Number(toYear) : -1);
  const nextClass = useMemo(() => {
    if (!src || !lk) return null;
    const ordered = lk.classes.filter((c) => c.is_active).sort((a, b) => a.sort_order - b.sort_order);
    const i = ordered.findIndex((c) => c.id === src.class_level_id);
    return ordered[i + 1] ?? null;
  }, [src, lk]);
  useEffect(() => {
    if (!students.data) return;
    const def = targets.find((s) => s.class_level_id === nextClass?.id && s.name === src?.name) ?? targets.find((s) => s.class_level_id === nextClass?.id);
    setRows(Object.fromEntries(students.data.filter((s) => s.enrollment_status === 'active').map((s) => [s.enrollment_id, { action: nextClass ? 'promote' : 'complete', toSectionId: def ? String(def.id) : '' }])));
  }, [students.data, toYear, nextClass?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = (students.data ?? []).filter((s) => s.enrollment_status === 'active');
  return (
    <>
      <PageHeader title={t('Promotion')} subtitle="Move students to the next academic year. Previous years' attendance, marks and fee records are preserved." />
      <Card>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label={`From (${current?.name ?? ''})`}><select className="input" value={fromSection} onChange={(e) => setFromSection(e.target.value)}><option value="">—</option>{sectionsFor(current?.id).map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}</select></Field>
          <Field label="To academic year" hint={!lk?.years.some((y) => !y.is_current) ? 'Create the next academic year in Settings first.' : undefined}>
            <select className="input" value={toYear} onChange={(e) => setToYear(e.target.value)}><option value="">—</option>{lk?.years.filter((y) => !y.is_current).map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select>
          </Field>
          <div className="flex items-end text-sm text-slate-500">{nextClass ? `Default next class: ${nextClass.name}` : src ? 'Final class – default action is "Completed".' : ''}</div>
        </div>
      </Card>
      {fromSection && toYear && (
        <Card className="mt-4" bodyClass="p-0" title={`${active.length} students`} actions={
          <button className="btn-primary" disabled={busy || !active.length} onClick={async () => {
            const items = Object.entries(rows).map(([eid, r]) => ({ enrollmentId: Number(eid), action: r.action, toSectionId: r.action === 'complete' ? null : Number(r.toSectionId) || null }));
            if (items.some((i) => i.action !== 'complete' && !i.toSectionId)) return;
            if (await confirm({ title: 'Confirm promotion', message: `Process ${items.length} students into the selected year?` })) {
              const r = await run(() => api.post('/api/students/promote', { toYearId: Number(toYear), items }), { success: 'Promotion completed.' });
              if (r) students.refetch();
            }
          }}>Process</button>}>
          {!targets.length && <p className="p-4 text-sm text-amber-700">The target year has no sections. Create them under Classes & Sections.</p>}
          <div className="overflow-x-auto"><table className="min-w-full text-sm">
            <thead className="bg-slate-50"><tr><th className="th">{t('Roll No.')}</th><th className="th">{t('Name')}</th><th className="th">Action</th><th className="th">Target section</th></tr></thead>
            <tbody className="divide-y">{active.map((s) => { const r = rows[s.enrollment_id]; if (!r) return null; return (
              <tr key={s.enrollment_id}><td className="td">{s.roll_no}</td><td className="td">{fullName(s)}</td>
                <td className="td"><select className="input" value={r.action} onChange={(e) => setRows({ ...rows, [s.enrollment_id]: { ...r, action: e.target.value } })}>
                  <option value="promote">Promote</option><option value="detain">Detain (repeat class)</option><option value="complete">Completed schooling</option></select></td>
                <td className="td">{r.action !== 'complete' && <select className="input" value={r.toSectionId} onChange={(e) => setRows({ ...rows, [s.enrollment_id]: { ...r, toSectionId: e.target.value } })}>
                  <option value="">—</option>{targets.map((x) => <option key={x.id} value={x.id}>{sectionLabel(x)}</option>)}</select>}</td>
              </tr>); })}</tbody>
          </table></div>
        </Card>
      )}
    </>
  );
}

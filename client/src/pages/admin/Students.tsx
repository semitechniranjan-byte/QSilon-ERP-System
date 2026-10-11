import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, Plus } from 'lucide-react';
import { Async, Badge, Card, PageHeader, StatusBadge, useApi } from '../../components/ui';
import { DataTable } from '../../components/DataTable';
import { useI18n } from '../../lib/i18n';
import { useLookups } from '../../lib/lookups';
import { useAuth } from '../../lib/auth';
import { qs } from '../../lib/api';
import { fullName, inr } from '../../lib/format';

export default function Students() {
  const { t } = useI18n();
  const { can } = useAuth();
  const nav = useNavigate();
  const { lk, current, sectionsFor, sectionLabel } = useLookups();
  const [f, setF] = useState({ yearId: '', sectionId: '', status: 'active', residency: '', transport: '', preschool: '' });
  const q = useApi(`/api/students${qs(f)}`);
  const yearId = f.yearId ? Number(f.yearId) : current?.id;
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v, ...(k === 'yearId' ? { sectionId: '' } : {}) }));
  return (
    <>
      <PageHeader title={t('Students')} actions={<>
        <a className="btn-secondary" href={`/api/reports/students${qs({ format: 'xlsx', yearId: f.yearId, sectionId: f.sectionId })}`}><Download className="h-4 w-4" />{t('Export Excel')}</a>
        {can('students.manage') && <Link to="/admin/students/new" className="btn-primary"><Plus className="h-4 w-4" />{t('Admissions')}</Link>}
      </>} />
      <Card bodyClass="p-0">
        <div className="grid grid-cols-2 gap-2 border-b border-slate-100 p-3 md:grid-cols-5">
          <select className="input" value={f.yearId} onChange={(e) => set('yearId', e.target.value)} aria-label={t('Academic Year')}>
            <option value="">{current?.name ?? t('Academic Year')}</option>{lk?.years.filter((y) => !y.is_current).map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
          <select className="input" value={f.sectionId} onChange={(e) => set('sectionId', e.target.value)} aria-label={t('Section')}>
            <option value="">{t('All')} {t('Classes')}</option>{sectionsFor(yearId).map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}
          </select>
          <select className="input" value={f.status} onChange={(e) => set('status', e.target.value)} aria-label={t('Status')}>
            {['active', 'withdrawn', 'transferred', 'alumni', 'all'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="input" value={f.residency} onChange={(e) => set('residency', e.target.value)} aria-label="Residency">
            <option value="">Hostel & day</option><option value="hostel">{t('Hostel resident')}</option><option value="day_scholar">{t('Day scholar')}</option>
          </select>
          <select className="input" value={f.transport} onChange={(e) => set('transport', e.target.value)} aria-label={t('Transport')}>
            <option value="">{t('Transport')}: {t('All')}</option><option value="yes">{t('Transport')}: {t('Yes')}</option><option value="no">{t('Transport')}: {t('No')}</option>
          </select>
          {lk?.classes.some((c) => c.is_preschool && c.is_active) && <select className="input" value={f.preschool} onChange={(e) => set('preschool', e.target.value)} aria-label={t('Preschool')}>
            <option value="">{t('Preschool')} & school</option><option value="yes">{t('Preschool')}</option><option value="no">School only</option>
          </select>}
        </div>
        <Async q={q}>{(rows: any[]) => (
          <DataTable rows={rows} onRowClick={(r) => nav(`/admin/students/${r.id}`)}
            search={(r) => `${fullName(r)} ${r.student_code} ${r.admission_no} ${r.roll_no ?? ''} ${r.guardian_name ?? ''} ${r.guardian_phone ?? ''}`}
            columns={[
              { key: 'student_code', header: t('Student ID'), render: (r) => <span className="font-mono text-xs">{r.student_code}</span>, sortValue: (r) => r.student_code },
              { key: 'name', header: t('Name'), render: (r) => <span className="font-medium text-slate-900">{fullName(r)}</span>, sortValue: fullName },
              { key: 'class', header: t('Class'), render: (r) => r.class_name ? `${r.class_name} – ${r.section_name}` : '—', sortValue: (r) => (r.sort_order ?? 99) * 100 + (r.section_name?.charCodeAt(0) ?? 0) },
              { key: 'roll_no', header: t('Roll No.') },
              { key: 'admission_no', header: t('Admission No.') },
              { key: 'guardian', header: t('Guardian'), render: (r) => <div><p>{r.guardian_name ?? '—'}</p><p className="text-xs text-slate-500">{r.guardian_phone}</p></div>, sortable: false },
              { key: 'tags', header: '', sortable: false, render: (r) => <div className="flex flex-wrap gap-1">
                {r.is_preschool && <Badge tone="amber">{t('Preschool')}</Badge>}{r.residency === 'hostel' && <Badge tone="purple">{t('Hostel')}</Badge>}{r.transport_opted && <Badge tone="blue">{t('Transport')}</Badge>}
                {r.status !== 'active' && <StatusBadge status={r.status} />}</div> },
              ...(can('fees.view') ? [{ key: 'outstanding_paise', header: t('Outstanding'), className: 'text-right', render: (r: any) => <span className={r.outstanding_paise > 0 ? 'font-medium text-amber-700' : 'text-emerald-700'}>{inr(r.outstanding_paise)}</span>, sortValue: (r: any) => r.outstanding_paise }] : []),
            ]} />
        )}</Async>
      </Card>
    </>
  );
}

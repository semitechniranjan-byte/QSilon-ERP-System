import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Async, Badge, Card, PageHeader, useApi } from '../../components/ui';
import { DataTable } from '../../components/DataTable';
import { useI18n } from '../../lib/i18n';
import { fullName } from '../../lib/format';

export default function MyClasses() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const sections = useApi<any[]>('/api/academics/sections');
  const sectionId = sp.get('sectionId') ?? '';
  useEffect(() => { if (!sectionId && sections.data?.length) setSp({ sectionId: String(sections.data[0].id) }, { replace: true }); }, [sections.data, sectionId, setSp]);
  const q = useApi<any[]>(sectionId ? `/api/academics/sections/${sectionId}/students` : null);
  const sec = sections.data?.find((s) => String(s.id) === sectionId);
  return (
    <>
      <PageHeader title={t('My Classes')} subtitle={sec ? `${sec.board ?? ''} · ${sec.medium_name ?? ''} · Class teacher: ${sec.class_teacher_name ?? '—'}` : undefined}
        actions={<select className="input w-56" value={sectionId} onChange={(e) => setSp({ sectionId: e.target.value })} aria-label={t('Section')}>{sections.data?.map((s) => <option key={s.id} value={s.id}>{s.class_name} – {s.name}</option>)}</select>} />
      <Card bodyClass="p-0">
        {sectionId ? <Async q={q}>{(rows) => (
          <DataTable rows={rows} rowKey={(r) => r.student_id} onRowClick={(r) => nav(`/teacher/students/${r.student_id}`)} search={(r) => `${fullName(r)} ${r.roll_no} ${r.student_code}`} columns={[
            { key: 'roll_no', header: t('Roll No.') },
            { key: 'name', header: t('Name'), render: (r) => <span className="font-medium">{fullName(r)}</span>, sortValue: fullName },
            { key: 'student_code', header: t('Student ID') },
            { key: 'guardian', header: t('Guardian'), render: (r) => <span>{r.guardian_name}<span className="block text-xs text-slate-500">{r.guardian_phone}</span></span>, sortable: false },
            { key: 'tags', header: '', sortable: false, render: (r) => <span className="flex gap-1">{r.residency === 'hostel' && <Badge tone="purple">{t('Hostel')}</Badge>}{r.transport_opted && <Badge tone="blue">{t('Transport')}</Badge>}</span> },
          ]} />
        )}</Async> : <p className="p-4 text-sm text-slate-500">No assigned classes.</p>}
      </Card>
    </>
  );
}

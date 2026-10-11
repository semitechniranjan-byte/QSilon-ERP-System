import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Async, Card, Field, Modal, PageHeader, StatusBadge, useAction, useApi } from '../../components/ui';
import { api, qs } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { fullName } from '../../lib/format';

export default function ClassResults() {
  const { t } = useI18n();
  const { id: routeExamId } = useParams();
  const { user, can } = useAuth();
  const [sp, setSp] = useSearchParams();
  const examId = routeExamId ?? sp.get('examId') ?? '';
  const sectionId = sp.get('sectionId') ?? '';
  const exams = useApi<any[]>(!routeExamId ? '/api/exams' : null);
  const sections = useApi<any[]>('/api/academics/sections');
  const mySections = (sections.data ?? []).filter((s) => user?.role !== 'teacher' || s.class_teacher_id === user.teacherId);
  const q = useApi<any>(examId && sectionId ? `/api/exams/${examId}/results?sectionId=${sectionId}` : null);
  const [remark, setRemark] = useState<any>(null);
  const { run, busy } = useAction();
  const rcLink = (sid: number) => (user?.role === 'teacher' ? `/teacher/report-card/${examId}/${sid}` : `/admin/exams/${examId}/report-card/${sid}`);
  return (
    <>
      <PageHeader title={t('Results')} back={routeExamId ? `/admin/exams/${routeExamId}` : undefined} actions={examId && sectionId && q.data?.exam?.assessment_mode === 'marks' &&
        <a className="btn-secondary" href={`/api/reports/exam-results${qs({ format: 'xlsx', examId, sectionId })}`}><Download className="h-4 w-4" />{t('Export Excel')}</a>} />
      <Card className="mb-4"><div className="grid gap-3 md:grid-cols-2">
        {!routeExamId && <Field label={t('Examinations')}><select className="input" value={examId} onChange={(e) => setSp({ examId: e.target.value, sectionId })}><option value="">—</option>{exams.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>}
        <Field label={t('Section')} hint={user?.role === 'teacher' ? 'Full class results are available to class teachers.' : undefined}>
          <select className="input" value={sectionId} onChange={(e) => { const n = new URLSearchParams(sp); n.set('sectionId', e.target.value); setSp(n); }}><option value="">—</option>{mySections.map((s) => <option key={s.id} value={s.id}>{s.class_name} – {s.name}</option>)}</select></Field>
      </div></Card>
      {q.data !== undefined || q.isLoading ? (
        <Async q={q}>{(d) => d.exam.assessment_mode === 'descriptive' ? (
          <Card bodyClass="p-0"><table className="min-w-full text-sm"><thead className="bg-slate-50"><tr><th className="th">#</th><th className="th">{t('Name')}</th>{d.domains.map((dm: any) => <th key={dm.id} className="th">{dm.name}</th>)}<th className="th" /></tr></thead>
            <tbody className="divide-y">{d.students.map((s: any) => <tr key={s.student_id}><td className="td">{s.roll_no}</td><td className="td">{fullName(s)}</td>{s.ratings.map((r: any) => <td key={r.domainId} className="td text-xs">{r.rating ?? '—'}</td>)}<td className="td"><Link className="link" to={rcLink(s.student_id)}>{t('Report card')}</Link></td></tr>)}</tbody></table></Card>
        ) : (
          <Card bodyClass="p-0">
            <div className="overflow-x-auto"><table className="min-w-full text-sm">
              <thead className="bg-slate-50"><tr><th className="th">#</th><th className="th">{t('Name')}</th>{d.students[0]?.subjects.map((s: any) => <th key={s.examSubjectId} className="th text-center">{s.subject}<br /><span className="font-normal normal-case">/{s.maxMarks}</span></th>)}
                <th className="th">{t('Total')}</th><th className="th">%</th><th className="th">{t('Grade')}</th><th className="th">{t('Result')}</th><th className="th">Rank</th><th className="th" /></tr></thead>
              <tbody className="divide-y">{d.students.map((s: any) => (
                <tr key={s.student_id}><td className="td">{s.roll_no}</td><td className="td whitespace-nowrap">{fullName(s)}</td>
                  {s.subjects.map((x: any) => <td key={x.examSubjectId} className={`td text-center ${x.passed === false ? 'text-red-600' : ''}`}>{x.isAbsent ? 'AB' : x.obtained ?? '—'}{x.submissionStatus && x.submissionStatus !== 'approved' && <span className="block text-[10px] text-amber-600">{x.submissionStatus}</span>}</td>)}
                  <td className="td">{s.total}/{s.max}</td><td className="td">{s.percent ?? '—'}</td><td className="td">{s.grade ?? '—'}</td><td className="td"><StatusBadge status={s.result} /></td><td className="td">{s.rank ?? '—'}</td>
                  <td className="td whitespace-nowrap"><Link className="link mr-3" to={rcLink(s.student_id)}>{t('Report card')}</Link><button className="link" onClick={() => setRemark({ studentId: s.student_id, name: fullName(s), teacherRemark: s.teacherRemark ?? '', principalRemark: s.principalRemark ?? '' })}>{t('Remarks')}</button></td></tr>))}</tbody>
            </table></div>
            <p className="p-3 text-xs text-slate-500">Students see only approved marks after the Principal publishes results. Ranks consider students with complete results.</p>
          </Card>
        )}</Async>
      ) : null}
      {remark && (
        <Modal open onClose={() => setRemark(null)} title={`${t('Remarks')}: ${remark.name}`} footer={<><button className="btn-secondary" onClick={() => setRemark(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={async () => { const body: any = { teacherRemark: remark.teacherRemark || null }; if (can('exams.manage')) body.principalRemark = remark.principalRemark || null; if (await run(() => api.put(`/api/exams/${examId}/remarks/${remark.studentId}`, body))) setRemark(null); }}>Save</button></>}>
          <Field label="Class teacher's remark"><textarea className="input" rows={3} value={remark.teacherRemark} onChange={(e) => setRemark({ ...remark, teacherRemark: e.target.value })} /></Field>
          {can('exams.manage') && <Field label="Principal's remark" className="mt-3"><textarea className="input" rows={3} value={remark.principalRemark} onChange={(e) => setRemark({ ...remark, principalRemark: e.target.value })} /></Field>}
        </Modal>
      )}
    </>
  );
}

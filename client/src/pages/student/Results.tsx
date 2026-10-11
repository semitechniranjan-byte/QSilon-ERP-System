import { Link } from 'react-router-dom';
import { Async, Card, PageHeader, StatusBadge, useApi } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { fmtDate } from '../../lib/format';

export default function StudentResults() {
  const { t, pick } = useI18n();
  const q = useApi<any[]>('/api/me/results');
  return (
    <>
      <PageHeader title={t('My Results')} />
      <Async q={q}>{(rows) => (
        <div className="space-y-4">{rows.map(({ exam, result }) => (
          <Card key={exam.id} title={`${exam.name} · ${exam.year_name}`} actions={<Link className="btn-secondary btn-sm" to={`/student/results/${exam.id}`}>{t('Report card')}</Link>}>
            <p className="mb-3 text-xs text-slate-500">Published {fmtDate(exam.published_at)}</p>
            {!result ? <p className="text-sm text-slate-500">—</p> : exam.assessment_mode === 'descriptive' ? (
              <ul className="grid gap-2 text-sm sm:grid-cols-2">{result.ratings.map((r: any) => <li key={r.domainId} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2"><span>{pick(r.domain, r.domainHi)}</span><b className="capitalize">{r.rating ?? '—'}</b></li>)}</ul>
            ) : (
              <>
                <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50"><tr><th className="th">{t('Subject')}</th><th className="th text-right">{t('Marks')}</th><th className="th text-right">{t('Max marks')}</th><th className="th">{t('Grade')}</th><th className="th">{t('Remarks')}</th></tr></thead>
                  <tbody className="divide-y">{result.subjects.map((s: any) => <tr key={s.examSubjectId}><td className="td">{pick(s.subject, s.subjectHi)}</td><td className={`td text-right ${s.passed === false ? 'text-red-600' : ''}`}>{!s.entered ? <span className="text-xs text-slate-400">awaiting</span> : s.isAbsent ? 'AB' : s.obtained}</td><td className="td text-right">{s.maxMarks}</td><td className="td">{s.grade ?? '—'}</td><td className="td text-xs">{s.remarks ?? ''}</td></tr>)}</tbody></table></div>
                <div className="mt-3 flex flex-wrap gap-4 text-sm"><span>{t('Total')}: <b>{result.total}/{result.max}</b></span><span>{t('Percentage')}: <b>{result.percent ?? '—'}%</b></span><span>{t('Grade')}: <b>{result.grade ?? '—'}</b></span><span>{t('Result')}: <StatusBadge status={result.result} /></span></div>
              </>
            )}
          </Card>))}
          {!rows.length && <Card><p className="text-sm text-slate-500">No results have been published yet.</p></Card>}
        </div>
      )}</Async>
    </>
  );
}

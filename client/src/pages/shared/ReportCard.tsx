import { useParams } from 'react-router-dom';
import { Download, Printer } from 'lucide-react';
import { Async, PageHeader, useApi } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { fmtDate, fullName } from '../../lib/format';

/** Printable report card. Students reach only their own via /api/me/results/:examId. */
export default function ReportCard() {
  const { t, pick, lang } = useI18n();
  const { user, school } = useAuth();
  const p = useParams();
  const examId = p.examId ?? p.id;
  const studentId = p.studentId ?? String(user?.studentId);
  const url = user?.role === 'student' ? `/api/me/results/${examId}` : `/api/exams/${examId}/report-card/${studentId}`;
  const q = useApi<any>(url);
  const pdf = `/api/exams/${examId}/report-card/${studentId}/pdf?lang=${lang}`;
  return (
    <Async q={q}>{(d) => {
      const s = d.student;
      return (
        <>
          <PageHeader title={`${t('Report card')} – ${d.exam.name}`} actions={<>
            <button className="btn-secondary" onClick={() => window.print()}><Printer className="h-4 w-4" />{t('Print')}</button>
            <a className="btn-primary" href={`${pdf}&download=1`}><Download className="h-4 w-4" />{t('Download PDF')}</a></>} />
          <div className="print-area card mx-auto max-w-3xl p-6 sm:p-8">
            <div className="border-b-2 border-brand-700 pb-3 text-center">
              <h2 className="text-xl font-bold text-brand-800">{school ? pick(school.name, school.nameHi) : ''}</h2>
              <p className="font-semibold text-brand-700">{t('Report card')} · {d.exam.name} · {d.year?.name}</p>
            </div>
            <dl className="my-4 grid grid-cols-2 gap-2 text-sm">
              <div><dt className="inline text-slate-500">{t('Name')}: </dt><dd className="inline font-semibold">{pick(fullName(s), s.name_hi)}</dd></div>
              <div><dt className="inline text-slate-500">{t('Student ID')}: </dt><dd className="inline">{s.student_code}</dd></div>
              <div><dt className="inline text-slate-500">{t('Class')}: </dt><dd className="inline">{pick(s.class_name, s.class_name_hi)} – {s.section_name}</dd></div>
              <div><dt className="inline text-slate-500">{t('Roll No.')}: </dt><dd className="inline">{s.roll_no}</dd></div>
              <div><dt className="inline text-slate-500">{t('Date of Birth')}: </dt><dd className="inline">{fmtDate(s.dob)}</dd></div>
              <div><dt className="inline text-slate-500">{t('Attendance')}: </dt><dd className="inline">{s.attendancePercent ?? '—'}%</dd></div>
            </dl>
            {d.mode === 'marks' ? (
              <>
                <table className="min-w-full border text-sm"><thead className="bg-brand-50"><tr><th className="th">{t('Subject')}</th><th className="th text-center">{t('Max marks')}</th><th className="th text-center">{t('Marks')}</th><th className="th text-center">{t('Grade')}</th></tr></thead>
                  <tbody className="divide-y">{s.subjects.map((x: any) => <tr key={x.examSubjectId}><td className="td">{pick(x.subject, x.subjectHi)}</td><td className="td text-center">{x.maxMarks}</td><td className={`td text-center ${x.passed === false ? 'text-red-600' : ''}`}>{x.isAbsent ? 'AB' : x.obtained ?? '—'}</td><td className="td text-center">{x.grade ?? '—'}</td></tr>)}</tbody></table>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{t('Total')}</p><p className="font-semibold">{s.total} / {s.max}</p></div>
                  <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{t('Percentage')}</p><p className="font-semibold">{s.percent ?? '—'}%</p></div>
                  <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{t('Grade')}</p><p className="font-semibold">{s.grade ?? '—'}</p></div>
                  <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{t('Result')}</p><p className="font-semibold capitalize">{s.result}</p></div>
                </div>
              </>
            ) : (
              <table className="min-w-full border text-sm"><thead className="bg-brand-50"><tr><th className="th">Learning area</th><th className="th">Progress</th><th className="th">Comment</th></tr></thead>
                <tbody className="divide-y">{s.ratings.map((r: any) => <tr key={r.domainId}><td className="td">{pick(r.domain, r.domainHi)}</td><td className="td capitalize">{r.rating ?? '—'}</td><td className="td">{r.comment}</td></tr>)}</tbody></table>
            )}
            <div className="mt-4 space-y-2 text-sm">
              <p><b>Class teacher:</b> {s.teacherRemark || '—'}</p>
              <p><b>Principal:</b> {s.principalRemark || '—'}</p>
            </div>
            <div className="mt-16 grid grid-cols-3 gap-6 text-center text-xs text-slate-600">
              {['Class Teacher', 'Principal', 'Parent / Guardian'].map((l) => <div key={l} className="border-t border-slate-400 pt-1">{l}</div>)}
            </div>
          </div>
        </>
      );
    }}</Async>
  );
}

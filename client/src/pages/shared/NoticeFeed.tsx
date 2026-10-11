import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Async, Badge, Card, PageHeader, useApi } from '../../components/ui';
import { NoticeModal } from '../../components/NoticeForm';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { fmtDate, fmtDateTime } from '../../lib/format';
import { Paragraphs } from '../public/Home';

export default function NoticeFeed() {
  const { t, pick } = useI18n();
  const { user } = useAuth();
  const q = useApi<any[]>('/api/notices');
  const events = useApi<any[]>(`/api/notices/events/list?from=${new Date().toISOString().slice(0, 10)}`);
  const sections = useApi<any[]>(user?.role === 'teacher' ? '/api/academics/sections' : null);
  const [compose, setCompose] = useState<any>(null);
  return (
    <>
      <PageHeader title={t('Notices')} actions={user?.role === 'teacher' && <button className="btn-primary" onClick={() => setCompose({ title: '', body: '', audience: 'section', sectionId: sections.data?.[0]?.id ?? '', pinned: false })}><Plus className="h-4 w-4" />Notice to my class</button>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <Async q={q} empty={(d) => !d.length}>{(rows) => <>{rows.map((n) => (
            <Card key={n.id}>
              <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{n.pinned && '📌 '}{pick(n.title, n.title_hi)}</h2>{n.audience === 'section' && <Badge tone="blue">{n.class_name ? `${n.class_name}-${n.section_name}` : 'My class'}</Badge>}</div>
              <p className="text-xs text-slate-500">{fmtDateTime(n.publish_at)}{n.author ? ` · ${n.author}` : ''}</p>
              <Paragraphs text={pick(n.body, n.body_hi)} className="mt-2 text-sm text-slate-700" />
              {n.attachment_file_id && <a className="link mt-2 inline-block text-sm" href={`/api/files/${n.attachment_file_id}`} target="_blank" rel="noreferrer">Attachment</a>}
            </Card>))}</>}</Async>
        </div>
        <Card title="Academic calendar">
          <ul className="divide-y text-sm">{events.data?.map((e) => <li key={e.id} className="py-2"><p className="font-medium">{pick(e.title, e.title_hi)} {e.event_type === 'holiday' && <Badge tone="red">holiday</Badge>}</p><p className="text-xs text-slate-500">{fmtDate(e.start_date)}{e.end_date && e.end_date !== e.start_date ? ` – ${fmtDate(e.end_date)}` : ''}</p></li>)}
            {!events.data?.length && <li className="py-2 text-slate-500">—</li>}</ul>
        </Card>
      </div>
      {compose && <NoticeModal notice={compose} sections={sections.data ?? []} teacherMode onClose={() => setCompose(null)} />}
    </>
  );
}
